"""In-memory sliding-window rate limiter.

Limitations (by design, no external dependencies):
- State is per-process and resets on restart/deploy.
- Not shared across instances; do not run more than one instance without
  moving to a shared store (e.g. Redis).
- Keys idle longer than the largest configured window are evicted to bound
  memory; a hard cap additionally drops least-recently-touched keys.
"""
import asyncio
import time

from fastapi import HTTPException, Request

from backend.config import RATE_LIMIT_AUTH_REQUESTS, RATE_LIMIT_AUTH_WINDOW


class RateLimiter:
    MAX_KEYS = 10_000

    def __init__(self):
        self._windows: dict[str, tuple[list[float], int]] = {}
        self._lock = asyncio.Lock()
        self._max_window = 0

    async def is_allowed(self, key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
        now = time.time()
        async with self._lock:
            self._max_window = max(self._max_window, window_seconds)
            if len(self._windows) >= self.MAX_KEYS:
                self._evict_locked(now)
            times, _ = self._windows.get(key, ([], window_seconds))
            times = [t for t in times if t > now - window_seconds]
            if len(times) >= limit:
                retry_after = int(times[0] + window_seconds - now) + 1
                self._windows[key] = (times, window_seconds)
                return False, max(retry_after, 1)
            times.append(now)
            self._windows[key] = (times, window_seconds)
            return True, 0

    def _evict_locked(self, now: float) -> None:
        cutoff = now - self._max_window
        stale = [k for k, (times, _) in self._windows.items() if not times or times[-1] <= cutoff]
        for k in stale:
            del self._windows[k]
        if len(self._windows) >= self.MAX_KEYS:
            ordered = sorted(
                self._windows.items(),
                key=lambda kv: kv[1][0][-1] if kv[1][0] else 0.0,
            )
            for k, _ in ordered[: len(ordered) // 2]:
                del self._windows[k]

    def reset(self):
        self._windows.clear()
        self._max_window = 0


rate_limiter = RateLimiter()


def rate_limit(limit: int, window_seconds: int):
    async def check(request: Request):
        token = request.headers.get("Authorization", "")
        user_key = token.replace("Bearer ", "") if token.startswith("Bearer ") else request.client.host if request.client else "unknown"
        allowed, retry_after = await rate_limiter.is_allowed(user_key, limit, window_seconds)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. Try again in {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)},
            )

    return check


def rate_limit_by_email(model):
    """Auth-endpoint limiter keyed by the submitted email, never by client IP.

    Behind a reverse proxy (Render) every request shares the proxy's source
    IP, so IP-keyed auth limits would throttle all users together. Keying by
    the target account instead protects each account at `limit` requests per
    window without trusting any client-supplied header.

    `model` is the endpoint's Pydantic body model; it must expose `email`.
    """

    async def check(body):
        email = str(getattr(body, "email", "") or "").strip().lower()
        key = f"auth:{email}" if email else "auth:anonymous"
        allowed, retry_after = await rate_limiter.is_allowed(
            key, RATE_LIMIT_AUTH_REQUESTS, RATE_LIMIT_AUTH_WINDOW
        )
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. Try again in {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)},
            )

    check.__annotations__["body"] = model
    return check
