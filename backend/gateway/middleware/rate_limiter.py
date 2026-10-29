"""
Token Bucket Rate Limiting Middleware.
Guards edge appliance endpoints against resource exhaustion and denial of service.
"""

import time
import threading
from typing import Dict, Tuple
from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from inference.shared.config import settings
from inference.shared.logger import get_logger

logger = get_logger("clinixvault.rate_limiter")


class TokenBucket:
    def __init__(self, capacity: int, refill_rate: float):
        self.capacity = float(capacity)
        self.tokens = float(capacity)
        self.refill_rate = refill_rate  # tokens per second
        self.last_update = time.time()
        self.lock = threading.Lock()

    def consume(self, amount: float = 1.0) -> bool:
        with self.lock:
            now = time.time()
            elapsed = now - self.last_update
            self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_rate)
            self.last_update = now

            if self.tokens >= amount:
                self.tokens -= amount
                return True
            return False


class RateLimiterMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, requests_per_minute: int = None):
        super().__init__(app)
        rpm = requests_per_minute or settings.RATE_LIMIT_PER_MINUTE
        self.capacity = rpm
        self.refill_rate = rpm / 60.0
        self.buckets: Dict[str, TokenBucket] = {}
        self.lock = threading.Lock()

    def _get_bucket(self, client_key: str) -> TokenBucket:
        with self.lock:
            if client_key not in self.buckets:
                self.buckets[client_key] = TokenBucket(self.capacity, self.refill_rate)
            return self.buckets[client_key]

    async def dispatch(self, request: Request, call_next):
        # Exclude internal health checks from rate limiting
        if request.url.path.endswith("/health"):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        bucket = self._get_bucket(client_ip)

        if not bucket.consume(1.0):
            logger.warning(f"Rate limit exceeded for client: {client_ip}")
            from starlette.responses import JSONResponse
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"detail": "Rate limit exceeded. Please back off request frequency."},
            )

        return await call_next(request)
