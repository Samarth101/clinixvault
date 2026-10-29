import sys
import time
import datetime
import hashlib
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from backend.database.connection import SessionLocal
from backend.database.models import AuditLog
from backend.gateway.metrics import record_request_metrics
from inference.shared.logger import get_logger

logger = get_logger("clinixvault.audit_middleware")


class AuditLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        client_ip = request.client.host if request.client else "127.0.0.1"
        user_agent = request.headers.get("user-agent", "unknown")
        user_id = request.headers.get("x-user-id", "anonymous")

        action_name = f"{request.method} {request.url.path}"

        try:
            response = await call_next(request)
            duration_sec = time.time() - start_time
            duration_ms = round(duration_sec * 1000, 2)
            status_code = response.status_code

            # Record Prometheus dimensional metrics
            record_request_metrics(request.method, request.url.path, status_code, duration_sec)

            # Determine service category and distinct ANSI coloring
            path = request.url.path
            is_routine_health = (
                path.endswith("/health")
                or path == "/api/v1/system/hardware"
                or path == "/metrics"
                or (path == "/api/v1/models/ollama/status" and status_code < 400)
            )

            # Suppress high-frequency routine background polling from cluttering stdout unless an error occurs
            now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]

            if is_routine_health and status_code < 400:
                # Dimmed, low-noise single-line pulse heartbeat for hardware/metrics polling
                sys.stdout.write(
                    f"\033[90m[{now_str}]\033[0m \033[36m⚙️  [SYS-PULSE]\033[0m \033[2;37m{request.method} {path} ● {status_code} ({duration_ms:.1f}ms)\033[0m\n"
                )
                sys.stdout.flush()
            else:
                if status_code < 300:
                    status_badge = f"\033[92m● {status_code} OK\033[0m"
                elif status_code < 400:
                    status_badge = f"\033[94m● {status_code} REDIRECT\033[0m"
                elif status_code < 500:
                    status_badge = f"\033[93m● {status_code} CLIENT ERR\033[0m"
                else:
                    status_badge = f"\033[91m● {status_code} SERVER ERR\033[0m"

                if "/scribe" in path:
                    mod_tag = "\033[1;35m🎙️  [SCRIBE-ASR]\033[0m"
                elif "/radiology" in path:
                    mod_tag = "\033[1;36m🩻  [RADIOLOGY-VLM]\033[0m"
                elif "/patients" in path:
                    mod_tag = "\033[1;32m👤  [PATIENT-EMR]\033[0m"
                elif "/summarize" in path:
                    mod_tag = "\033[1;34m📄  [SUMMARIZER-LLM]\033[0m"
                elif "/graph" in path:
                    mod_tag = "\033[1;33m🕸️  [GRAPH-NEO4J]\033[0m"
                elif "/models" in path:
                    mod_tag = "\033[1;95m⚡  [MODEL-RUNTIME]\033[0m"
                elif "/auth" in path:
                    mod_tag = "\033[1;96m🔒  [SECURITY-AUTH]\033[0m"
                else:
                    mod_tag = "\033[1;37m🌐  [API-GATEWAY]\033[0m"

                sys.stdout.write(
                    f"\033[90m[{now_str}]\033[0m {mod_tag} {status_badge} | "
                    f"\033[1m{request.method:<4}\033[0m {path} | "
                    f"\033[93m{duration_ms:>6.1f} ms\033[0m | IP: {client_ip}\n"
                )
                sys.stdout.flush()

            # Skip routine telemetry from bloating database audit logs
            if not is_routine_health:
                logger.info(
                    f"{request.method} {path} ● {status_code} ({duration_ms:.1f}ms)",
                    extra={
                        "service": "api_gateway",
                        "method": request.method,
                        "path": path,
                        "status_code": status_code,
                        "duration_ms": duration_ms,
                        "client_ip": client_ip,
                        "user_id": user_id,
                        "action": action_name,
                    },
                )
                try:
                    db = SessionLocal()
                    log_entry = AuditLog(
                        user_id=user_id,
                        action=action_name,
                        resource_type="API_ENDPOINT",
                        resource_id=request.url.path,
                        client_ip=client_ip,
                        user_agent=user_agent[:250],
                        status_code=status_code,
                        latency_ms=duration_ms,
                    )
                    db.add(log_entry)
                    db.commit()
                    db.close()
                except Exception as db_err:
                    logger.warning(f"Failed to persist audit log: {db_err}")

            return response

        except Exception as exc:
            duration_sec = time.time() - start_time
            duration_ms = round(duration_sec * 1000, 2)
            record_request_metrics(request.method, request.url.path, 500, duration_sec)
            logger.error(
                f"Unhandled Exception on {request.method} {request.url.path}: {exc}",
                exc_info=True,
                extra={
                    "service": "api_gateway",
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": 500,
                    "duration_ms": duration_ms,
                    "client_ip": client_ip,
                    "user_id": user_id,
                    "action": action_name,
                },
            )
            now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
            sys.stdout.write(
                f"\033[90m[{now_str}]\033[0m \033[1;36m[API-GATEWAY]\033[0m \033[91m● 500 EXCEPTION\033[0m | "
                f"\033[1m{request.method:<4}\033[0m {request.url.path} | "
                f"\033[93mLatency: {duration_ms:>7.2f} ms\033[0m | Error: {exc}\n"
            )
            sys.stdout.flush()

            try:
                db = SessionLocal()
                log_entry = AuditLog(
                    user_id=user_id,
                    action=action_name,
                    resource_type="API_ENDPOINT",
                    resource_id=request.url.path,
                    client_ip=client_ip,
                    user_agent=user_agent[:250],
                    status_code=500,
                    latency_ms=duration_ms,
                )
                db.add(log_entry)
                db.commit()
                db.close()
            except Exception as audit_err:
                logger.error(f"Failed to record exception audit log: {audit_err}")
            raise exc
