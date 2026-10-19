"""Stripe Checkout / Billing (test mode) — subscriptions with free trial.

Security invariants:
- Entitlement is granted ONLY from verified webhook events or direct Stripe
  API reads — frontend success redirects are never trusted as proof of payment.
- Webhook processing verifies the `stripe-signature` header and is idempotent
  via the unique `stripe_events.event_id` ledger (upserts are also idempotent).
- Only test-mode secret keys (sk_test_) are accepted unless STRIPE_ALLOW_LIVE
  is explicitly enabled (requires operator approval).
- No card data ever touches this server: collection happens on Stripe-hosted
  Checkout / Billing Portal pages. Publishable key + price IDs are the only
  public values returned.
- All secrets come from environment variables (backend.config).
"""
import logging
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError

import backend.config as config
from backend.access import (
    entitlement_status,
    get_latest_subscription,
    subscription_is_valid,
)
from backend.api.deps import get_current_student
from backend.api.ratelimit import RATE_LIMIT_AUTH_REQUESTS, RATE_LIMIT_AUTH_WINDOW, rate_limiter
from backend.database import SessionLocal
from backend.models import Invite, Student, StripeEvent, Subscription

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing", tags=["billing"])
webhook_router = APIRouter(tags=["webhooks"])

SETUP_MESSAGE = (
    "Stripe billing is not configured yet. Set STRIPE_SECRET_KEY, "
    "STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET and the STRIPE_PRICE_ID_* "
    "environment variables (test mode) to enable subscriptions."
)
PRICE_NOT_CONFIGURED = (
    "The requested subscription plan is not configured. "
    "Set STRIPE_PRICE_ID_MONTHLY / STRIPE_PRICE_ID_YEARLY in the backend environment."
)
LIVE_BLOCKED_MESSAGE = (
    "Live payments are disabled. Only Stripe test-mode keys (sk_test_) are "
    "accepted until live billing is explicitly approved."
)
ALREADY_SUBSCRIBED = "You already have an active subscription or trial."

_price_cache: dict = {"at": 0.0, "plans": None}
_PRICE_CACHE_TTL = 300.0


class CheckoutBody(BaseModel):
    price_key: str = Field(default="monthly", pattern="^(monthly|yearly)$")


class SignupCheckoutBody(BaseModel):
    student_id: str = Field(min_length=3, max_length=20, pattern=r"^STU-[0-9]{1,10}$")
    invite_code: str = Field(min_length=8, max_length=128)
    price_key: str = Field(default="monthly", pattern="^(monthly|yearly)$")


def _configured() -> bool:
    return bool(config.STRIPE_SECRET_KEY and config.STRIPE_PUBLISHABLE_KEY)


def _require_ready() -> None:
    if not _configured():
        raise HTTPException(status_code=403, detail=SETUP_MESSAGE)
    secret = config.STRIPE_SECRET_KEY or ""
    if not secret.startswith("sk_test_") and not config.STRIPE_ALLOW_LIVE:
        raise HTTPException(status_code=403, detail=LIVE_BLOCKED_MESSAGE)


def _stripe_key() -> str:
    stripe.api_key = config.STRIPE_SECRET_KEY
    return stripe.api_key or ""


def _plans() -> list[dict]:
    raw = [
        ("monthly", config.STRIPE_PRICE_ID_MONTHLY, config.STRIPE_PLAN_MONTHLY_NAME),
        ("yearly", config.STRIPE_PRICE_ID_YEARLY, config.STRIPE_PLAN_YEARLY_NAME),
    ]
    now = datetime.now(timezone.utc).timestamp()
    cached = _price_cache.get("plans")
    if cached is not None and _price_cache.get("at", 0) + _PRICE_CACHE_TTL > now:
        return cached
    plans = []
    for key, price_id, name in raw:
        plan = {
            "key": key, "price_id": price_id, "name": name,
            "available": bool(price_id),
            "amount": None, "currency": None, "interval": None,
        }
        if price_id and _configured():
            _stripe_key()
            try:
                price = stripe.Price.retrieve(price_id)
                plan["amount"] = price.unit_amount
                plan["currency"] = (price.currency or "").upper() or None
                plan["interval"] = getattr(price.recurring, "interval", None) if price.recurring else None
            except stripe.StripeError as exc:
                logger.warning("Price retrieve failed for %s: %s", price_id, exc)
        plans.append(plan)
    _price_cache["plans"] = plans
    _price_cache["at"] = now
    return plans


def _estimated_first_billing() -> str:
    return (datetime.now(timezone.utc) + timedelta(days=config.STRIPE_TRIAL_DAYS)).isoformat()


def _allowed_price_id(price_key: str) -> str:
    if price_key == "monthly" and config.STRIPE_PRICE_ID_MONTHLY:
        return config.STRIPE_PRICE_ID_MONTHLY
    if price_key == "yearly" and config.STRIPE_PRICE_ID_YEARLY:
        return config.STRIPE_PRICE_ID_YEARLY
    raise HTTPException(status_code=403, detail=PRICE_NOT_CONFIGURED)


def _ensure_customer(session, student: Student) -> str:
    row = session.query(Student).filter_by(id=student.id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Student not found")
    if row.stripe_customer_id:
        return row.stripe_customer_id
    _stripe_key()
    customer = stripe.Customer.create(
        email=row.email,
        metadata={"student_id": str(row.id), "student_business_id": row.student_id},
    )
    row.stripe_customer_id = customer.id
    session.commit()
    return customer.id


def _create_checkout_session(student: Student, price_id: str, session) -> dict:
    _stripe_key()
    customer_id = _ensure_customer(session, student)
    checkout_session = stripe.checkout.Session.create(
        mode="subscription",
        customer=customer_id,
        line_items=[{"price": price_id, "quantity": 1}],
        client_reference_id=student.student_id,
        payment_method_collection="always",
        subscription_data={
            "trial_period_days": max(config.STRIPE_TRIAL_DAYS, 0),
            "metadata": {"student_id": str(student.id)},
        },
        success_url=f"{config.FRONTEND_BASE_URL}/billing/success",
        cancel_url=f"{config.FRONTEND_BASE_URL}/billing/cancel",
    )
    return {
        "url": checkout_session.url,
        "trial_days": config.STRIPE_TRIAL_DAYS,
        "estimated_first_billing_date": _estimated_first_billing(),
    }


def _has_valid_subscription(session, student_id: int) -> bool:
    return subscription_is_valid(get_latest_subscription(session, student_id))


@router.get("/config")
def billing_config():
    """Public (no secrets): publishable key, price ids, amounts, trial length."""
    configured = _configured()
    secret = config.STRIPE_SECRET_KEY or ""
    test_mode = secret.startswith("sk_test_") if secret else None
    plans = _plans() if configured else [
        {"key": "monthly", "price_id": None, "name": config.STRIPE_PLAN_MONTHLY_NAME,
         "available": False, "amount": None, "currency": None, "interval": None},
        {"key": "yearly", "price_id": None, "name": config.STRIPE_PLAN_YEARLY_NAME,
         "available": False, "amount": None, "currency": None, "interval": None},
    ]
    return {
        "configured": configured,
        "publishable_key": config.STRIPE_PUBLISHABLE_KEY if configured else None,
        "test_mode": test_mode,
        "trial_days": config.STRIPE_TRIAL_DAYS,
        "estimated_first_billing_date": _estimated_first_billing() if configured else None,
        "portal_configured": bool(config.STRIPE_BILLING_PORTAL_CONFIGURATION_ID) and configured,
        "plans": plans,
        "setup_message": None if configured else SETUP_MESSAGE,
    }


@router.post("/status")
def billing_status(student: Student = Depends(get_current_student)):
    ent = entitlement_status(student)
    return {
        **ent,
        "configured": _configured(),
        "trial_days": config.STRIPE_TRIAL_DAYS,
        "portal_configured": bool(config.STRIPE_BILLING_PORTAL_CONFIGURATION_ID) and _configured(),
        "has_customer": bool(student.stripe_customer_id)
        or bool(ent["subscription"] and ent["subscription"].get("stripe_customer_id")),
        "setup_message": None if _configured() else SETUP_MESSAGE,
    }


@router.post("/checkout")
def start_checkout(body: CheckoutBody, student: Student = Depends(get_current_student)):
    _require_ready()
    price_id = _allowed_price_id(body.price_key)
    session = SessionLocal()
    try:
        if _has_valid_subscription(session, student.id):
            raise HTTPException(status_code=400, detail=ALREADY_SUBSCRIBED)
        if student.is_beta_tester:
            raise HTTPException(
                status_code=400,
                detail="This account has a free beta entitlement — no payment details are needed.",
            )
        return _create_checkout_session(student, price_id, session)
    except stripe.StripeError as exc:
        logger.error("Checkout session creation failed for %s: %s", student.student_id, exc)
        raise HTTPException(status_code=402, detail=f"Stripe checkout failed: {exc.user_message if hasattr(exc, 'user_message') else exc}")
    finally:
        session.close()


@router.post("/checkout-at-signup")
async def checkout_at_signup(body: SignupCheckoutBody):
    """Checkout for a freshly signed-up (possibly still pending) student.

    Authorized by the consumed invite code that created the account — no
    session token exists yet at this point in the signup flow. Rate limited
    per student to prevent abuse.
    """
    _require_ready()
    allowed, retry_after = await rate_limiter.is_allowed(
        f"billing-signup:{body.student_id}", 10, RATE_LIMIT_AUTH_WINDOW
    )
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )
    price_id = _allowed_price_id(body.price_key)
    session = SessionLocal()
    try:
        student = session.query(Student).filter_by(student_id=body.student_id).first()
        if student is None:
            raise HTTPException(status_code=404, detail="Student not found")
        invite = session.query(Invite).filter_by(code=body.invite_code).first()
        if (
            invite is None
            or invite.revoked_at is not None
            or invite.used_at is None
            or invite.used_by_user_id != student.id
            or (invite.email or "").lower() != (student.email or "").lower()
        ):
            raise HTTPException(status_code=400, detail="Invite code does not match this signup")
        if student.account_status not in ("pending", "active"):
            raise HTTPException(status_code=403, detail="Account cannot start a trial")
        if _has_valid_subscription(session, student.id):
            raise HTTPException(status_code=400, detail=ALREADY_SUBSCRIBED)
        if student.is_beta_tester:
            raise HTTPException(
                status_code=400,
                detail="This account has a free beta entitlement — no payment details are needed.",
            )
        return _create_checkout_session(student, price_id, session)
    except stripe.StripeError as exc:
        logger.error("Signup checkout failed for student %s: %s", body.student_id, exc)
        raise HTTPException(status_code=402, detail=f"Stripe checkout failed: {exc}")
    finally:
        session.close()


@router.post("/portal")
def billing_portal(student: Student = Depends(get_current_student)):
    _require_ready()
    session = SessionLocal()
    try:
        sub = get_latest_subscription(session, student.id)
        customer_id = student.stripe_customer_id or (sub.stripe_customer_id if sub else None)
        if not customer_id:
            raise HTTPException(
                status_code=400,
                detail="No billing account found yet — start a subscription first.",
            )
        _stripe_key()
        kwargs: dict = {
            "customer": customer_id,
            "return_url": f"{config.FRONTEND_BASE_URL}/student",
        }
        if config.STRIPE_BILLING_PORTAL_CONFIGURATION_ID:
            kwargs["configuration"] = config.STRIPE_BILLING_PORTAL_CONFIGURATION_ID
        portal = stripe.billing_portal.Session.create(**kwargs)
        return {"url": portal.url}
    except stripe.StripeError as exc:
        logger.error("Billing portal failed for %s: %s", student.student_id, exc)
        raise HTTPException(
            status_code=400,
            detail="Billing portal is not available yet — configure the Stripe Billing Portal "
                   "for this account (see docs/16-subscriptions-stripe.md).",
        )
    finally:
        session.close()


@router.post("/cancel")
def cancel_subscription(student: Student = Depends(get_current_student)):
    """Cancel the current subscription. During a trial the cancellation is
    IMMEDIATE, so Stripe never issues an invoice and no charge occurs."""
    _require_ready()
    session = SessionLocal()
    try:
        sub = get_latest_subscription(session, student.id)
        if sub is None or sub.status in ("canceled", "incomplete_expired"):
            raise HTTPException(status_code=400, detail="No active subscription to cancel.")
        _stripe_key()
        if sub.status == "trialing":
            stripe.Subscription.delete(sub.stripe_subscription_id)
            sub.status = "canceled"
            sub.canceled_at = datetime.now(timezone.utc)
            sub.ended_during_trial = True
        else:
            stripe.Subscription.modify(sub.stripe_subscription_id, cancel_at_period_end=True)
            sub.cancel_at_period_end = True
        session.commit()
        return {
            "canceled": True,
            "during_trial": sub.status == "canceled" and sub.ended_during_trial,
            "status": sub.status,
            "cancel_at_period_end": sub.cancel_at_period_end,
            "message": (
                "Trial canceled — no subscription charge was made."
                if sub.ended_during_trial
                else "Subscription will end at the end of the current billing period."
            ),
        }
    except stripe.StripeError as exc:
        logger.error("Cancel failed for %s: %s", student.student_id, exc)
        raise HTTPException(status_code=402, detail=f"Stripe cancel failed: {exc}")
    finally:
        session.close()


# --- Webhook ----------------------------------------------------------------


def _ts(value) -> datetime | None:
    if not value:
        return None
    return datetime.fromtimestamp(value, tz=timezone.utc)


def _find_student_by_ref(session, client_ref, metadata_customer=None, metadata_student=None) -> Student | None:
    if metadata_student:
        row = session.query(Student).filter_by(id=int(metadata_student)).first()
        if row is not None:
            return row
    if client_ref:
        row = session.query(Student).filter_by(student_id=str(client_ref)).first()
        if row is not None:
            return row
    if metadata_customer:
        row = session.query(Student).filter_by(stripe_customer_id=str(metadata_customer)).first()
        if row is not None:
            return row
    return None


def _upsert_subscription(session, obj: dict) -> Subscription | None:
    status = obj.get("status") or "canceled"
    sub_id = obj.get("id")
    customer = obj.get("customer") or ""
    metadata_student = (obj.get("metadata") or {}).get("student_id")
    items = (obj.get("items") or {}).get("data") or []
    price_id = items[0].get("price", {}).get("id") if items else None

    sub = session.query(Subscription).filter_by(stripe_subscription_id=sub_id).first()
    if sub is None:
        student = _find_student_by_ref(session, None, metadata_customer=customer, metadata_student=metadata_student)
        if student is None:
            logger.warning("Webhook: cannot resolve student for subscription %s", sub_id)
            return None
        sub = Subscription(
            student_id=student.id, stripe_subscription_id=sub_id,
            stripe_customer_id=customer, status=status,
        )
        session.add(sub)
    previous_status = sub.status
    sub.status = status
    sub.stripe_customer_id = customer or sub.stripe_customer_id
    sub.price_id = price_id or sub.price_id
    sub.cancel_at_period_end = bool(obj.get("cancel_at_period_end"))
    sub.trial_end = _ts(obj.get("trial_end"))
    sub.current_period_start = _ts(obj.get("current_period_start"))
    sub.current_period_end = _ts(obj.get("current_period_end"))
    sub.canceled_at = _ts(obj.get("canceled_at"))
    if status == "canceled":
        if previous_status == "trialing" or (
            sub.trial_end and sub.canceled_at and sub.canceled_at <= sub.trial_end
        ):
            sub.ended_during_trial = True
        elif previous_status not in ("trialing", "canceled"):
            sub.ended_during_trial = False
    if student_customer := customer:
        owner = session.query(Student).filter_by(stripe_customer_id=student_customer).first()
        if owner is None and metadata_student:
            owner = session.query(Student).filter_by(id=int(metadata_student)).first()
            if owner is not None and not owner.stripe_customer_id:
                owner.stripe_customer_id = student_customer
    return sub


def _handle_event(session, event) -> None:
    event_type = event.get("type") or ""
    data = (event.get("data") or {}).get("object") or {}

    if event_type == "checkout.session.completed":
        student = _find_student_by_ref(
            session,
            data.get("client_reference_id"),
            metadata_customer=data.get("customer"),
            metadata_student=(data.get("metadata") or {}).get("student_id"),
        )
        if student is not None and data.get("customer") and not student.stripe_customer_id:
            student.stripe_customer_id = data["customer"]
        return

    if event_type in (
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    ):
        if event_type == "customer.subscription.deleted":
            data = {**data, "status": "canceled"}
        _upsert_subscription(session, data)
        return

    if event_type in ("invoice.payment_failed", "invoice.paid"):
        sub_ref = data.get("subscription")
        if not sub_ref:
            return
        sub = session.query(Subscription).filter_by(stripe_subscription_id=sub_ref).first()
        if sub is None:
            _upsert_subscription(
                session,
                {"id": sub_ref, "customer": data.get("customer") or "",
                 "status": "past_due" if event_type == "invoice.payment_failed" else "active",
                 "metadata": {}},
            )
            return
        if event_type == "invoice.payment_failed":
            if sub.status not in ("canceled",):
                sub.status = "past_due"
        else:
            if sub.status in ("past_due", "unpaid"):
                sub.status = "active"
        return

    logger.info("Webhook: ignoring unhandled event type %s", event_type)


@webhook_router.post("/webhooks/stripe")
async def stripe_webhook(request: Request):
    secret = config.STRIPE_WEBHOOK_SECRET
    if not secret:
        return JSONResponse(
            status_code=503,
            content={"detail": "Stripe webhook secret (STRIPE_WEBHOOK_SECRET) is not configured. " + SETUP_MESSAGE},
        )
    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, signature, secret)
    except ValueError:
        return JSONResponse(status_code=400, content={"detail": "Invalid webhook payload"})
    except stripe.SignatureVerificationError:
        return JSONResponse(status_code=400, content={"detail": "Invalid webhook signature"})
    if hasattr(event, "to_dict"):
        event = event.to_dict()

    event_id = event.get("id")
    event_type = event.get("type") or "unknown"
    session = SessionLocal()
    try:
        if event_id and session.query(StripeEvent).filter_by(event_id=event_id).first():
            return {"received": True, "duplicate": True}
        _handle_event(session, event)
        if event_id:
            session.add(StripeEvent(event_id=event_id, event_type=event_type))
        session.commit()
    except IntegrityError:
        session.rollback()
        return {"received": True, "duplicate": True}
    finally:
        session.close()
    return {"received": True}
