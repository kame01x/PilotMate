"""Subscription / beta entitlement checks.

Access to paid (AI) student features requires EITHER:
- an explicit administrator-granted beta entitlement (`Student.is_beta_tester`),
  which never expires and needs no payment details, OR
- a Stripe subscription in `active` or `trialing` status (incl. the free
  trial period), whose period/trial end must still be in the future.

Enforcement mode comes from config.SUBSCRIPTION_ENFORCE:
- "on": always enforce (tests, staging if explicitly set)
- "off": never enforce (local development convenience)
- "auto": enforce whenever ENVIRONMENT != "development" (staging/prod default)

Read via `import backend.config as config` and attribute access at call time
so tests can patch values without reimporting modules.
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import Depends, HTTPException

import backend.config as config
from backend.api.deps import get_current_student
from backend.database import SessionLocal
from backend.models import Student, Subscription

VALID_SUB_STATUSES = {"active", "trialing"}

_FALSE_MODES = {"off", "false", "0", "no"}
_TRUE_MODES = {"on", "true", "1", "yes"}

NOT_SUBSCRIBED = (
    "A subscription is required for this feature. "
    "Subscribe to start your free trial."
)
PAYMENT_FAILED = (
    "Your last payment failed. Please update your payment method "
    "to continue using this feature."
)
SUBSCRIPTION_ENDED = (
    "Your subscription has ended. Please subscribe again to continue."
)
TRIAL_EXPIRED_NO_PAYMENT = (
    "Your free trial has ended. Please add a payment method to continue."
)


def subscription_enforced() -> bool:
    mode = str(config.SUBSCRIPTION_ENFORCE or "auto").strip().lower()
    if mode in _FALSE_MODES:
        return False
    if mode in _TRUE_MODES:
        return True
    return config.ENVIRONMENT != "development"


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def get_latest_subscription(session, student_id: int) -> Subscription | None:
    return (
        session.query(Subscription)
        .filter_by(student_id=student_id)
        .order_by(Subscription.updated_at.desc(), Subscription.id.desc())
        .first()
    )


def subscription_is_valid(sub: Subscription | None) -> bool:
    """Server-side validity: status AND period/trial boundaries. Doubles as a
    safety net if a webhook was missed (period end passed with no update)."""
    if sub is None or sub.status not in VALID_SUB_STATUSES:
        return False
    now = datetime.now(timezone.utc)
    if sub.status == "trialing" and _aware(sub.trial_end) and _aware(sub.trial_end) < now:
        return False
    if _aware(sub.current_period_end) and _aware(sub.current_period_end) < now:
        return False
    return True


def subscription_access_reason(sub: Subscription | None) -> str | None:
    if sub is None:
        return None
    if sub.status == "trialing":
        return "trial"
    if sub.status == "active":
        return "subscription"
    return None


def entitlement_status(student: Student) -> dict:
    """Full entitlement picture for API responses (no Stripe calls)."""
    session = SessionLocal()
    try:
        sub = get_latest_subscription(session, student.id)
        sub_valid = subscription_is_valid(sub)
        beta = bool(student.is_beta_tester)
        reason = "beta" if beta else (subscription_access_reason(sub) if sub_valid else None)
        if not beta and not sub_valid and sub is not None:
            if sub.status in ("past_due", "unpaid"):
                detail = PAYMENT_FAILED
            elif sub.status == "trialing":
                detail = TRIAL_EXPIRED_NO_PAYMENT
            else:
                detail = SUBSCRIPTION_ENDED
        elif not beta and sub is None:
            detail = NOT_SUBSCRIBED
        else:
            detail = None
        return {
            "has_access": beta or sub_valid,
            "is_beta_tester": beta,
            "access_reason": reason,
            "blocked_reason": None if (beta or sub_valid) else detail,
            "subscription": _sub_dict(sub),
            "enforced": subscription_enforced(),
        }
    finally:
        session.close()


def _sub_dict(sub: Subscription | None) -> dict | None:
    if sub is None:
        return None
    return {
        "status": sub.status,
        "price_id": sub.price_id,
        "cancel_at_period_end": sub.cancel_at_period_end,
        "trial_end": _iso(sub.trial_end),
        "current_period_start": _iso(sub.current_period_start),
        "current_period_end": _iso(sub.current_period_end),
        "canceled_at": _iso(sub.canceled_at),
        "ended_during_trial": sub.ended_during_trial,
        "updated_at": _iso(sub.updated_at),
    }


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def require_student_access(student: Student = Depends(get_current_student)) -> Student:
    """Drop-in replacement for get_current_student on paid student features."""
    if not subscription_enforced() or student.is_beta_tester:
        return student
    session = SessionLocal()
    try:
        sub = get_latest_subscription(session, student.id)
        if subscription_is_valid(sub):
            return student
        if sub is None:
            detail = NOT_SUBSCRIBED
        elif sub.status in ("past_due", "unpaid"):
            detail = PAYMENT_FAILED
        elif sub.status == "trialing":
            detail = TRIAL_EXPIRED_NO_PAYMENT
        else:
            detail = SUBSCRIPTION_ENDED
        raise HTTPException(status_code=403, detail=detail)
    finally:
        session.close()
