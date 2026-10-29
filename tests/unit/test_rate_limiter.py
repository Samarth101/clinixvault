"""
Unit Tests for Token Bucket Rate Limiting and HTTP 429 Response.
Verifies rate limiting properly returns 429 Too Many Requests without unhandled 500 errors.
"""

import time
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.gateway.middleware.rate_limiter import TokenBucket, RateLimiterMiddleware


def test_token_bucket_consume_and_refill():
    bucket = TokenBucket(capacity=3, refill_rate=10.0)  # 10 tokens/sec
    assert bucket.consume(1.0) is True
    assert bucket.consume(1.0) is True
    assert bucket.consume(1.0) is True
    # Exhausted
    assert bucket.consume(1.0) is False

    # Wait for refill
    time.sleep(0.2)  # ~2 tokens refilled
    assert bucket.consume(1.0) is True


def test_rate_limiter_middleware_returns_429():
    app = FastAPI()
    app.add_middleware(RateLimiterMiddleware, requests_per_minute=2)

    @app.get("/test-endpoint")
    def test_endpoint():
        return {"status": "ok"}

    @app.get("/health")
    def health_endpoint():
        return {"status": "healthy"}

    client = TestClient(app)

    # First 2 requests succeed
    res1 = client.get("/test-endpoint")
    assert res1.status_code == 200

    res2 = client.get("/test-endpoint")
    assert res2.status_code == 200

    # 3rd request exceeds capacity -> MUST return 429, NOT 500!
    res3 = client.get("/test-endpoint")
    assert res3.status_code == 429
    data = res3.json()
    assert "Rate limit exceeded" in data["detail"]

    # Health check is exempt from rate limiting
    res_health = client.get("/health")
    assert res_health.status_code == 200
