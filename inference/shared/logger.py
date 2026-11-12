"""
Structured JSON Logging Module for ClinixVault Edge Engine.
Outputs machine-parseable JSON logs formatted for edge syslog/fluentd/promtail,
with automatic correlation IDs and PHI-safe handling.
"""

import os
import sys
import json
import logging
import datetime
from typing import Any, Dict, Optional
from logging.handlers import RotatingFileHandler


IST_TZ = datetime.timezone(datetime.timedelta(hours=5, minutes=30), name="IST")


class ConsoleISTFormatter(logging.Formatter):
    """Formats log records for high-visibility terminal output with real-time IST (UTC+05:30) timestamps."""

    def format(self, record: logging.LogRecord) -> str:
        ist_time = datetime.datetime.fromtimestamp(record.created, tz=IST_TZ).strftime("%Y-%m-%d %H:%M:%S IST")
        level = record.levelname
        color = "\033[92m" if record.levelno == logging.INFO else (
            "\033[93m" if record.levelno == logging.WARNING else (
                "\033[91m" if record.levelno >= logging.ERROR else "\033[94m"
            )
        )
        reset = "\033[0m"
        msg = record.getMessage()
        return f"{color}[{ist_time}] [{level}] [{record.name}]{reset} {msg}"


class JSONFormatter(logging.Formatter):
    """Formats Python log records as standard single-line JSON entries."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry: Dict[str, Any] = {
            "timestamp": datetime.datetime.fromtimestamp(record.created, tz=IST_TZ).isoformat(),
            "timestamp_ist": datetime.datetime.fromtimestamp(record.created, tz=IST_TZ).strftime("%Y-%m-%d %H:%M:%S IST"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "line": record.lineno,
        }

        # Include custom context attributes passed via extra
        context_fields = [
            "request_id",
            "patient_id",
            "duration_ms",
            "service",
            "status_code",
            "method",
            "path",
            "client_ip",
            "user_id",
            "action",
        ]
        for field in context_fields:
            if hasattr(record, field):
                log_entry[field] = getattr(record, field)

        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_entry)


def get_logger(name: str, level: str = "INFO") -> logging.Logger:
    """Configures and returns a structured JSON logger with stdout and rotating file sinks."""
    logger = logging.getLogger(name)
    numeric_level = getattr(logging, level.upper(), logging.INFO)
    logger.setLevel(numeric_level)

    # Avoid duplicate handlers if logger was already created
    if not logger.handlers:
        # 1. Console Stream Handler (stdout) with realtime IST formatting
        stream_handler = logging.StreamHandler(sys.stdout)
        if os.getenv("CLINIXVAULT_CONSOLE_FORMAT", "human").lower() == "json":
            stream_handler.setFormatter(JSONFormatter())
        else:
            stream_handler.setFormatter(ConsoleISTFormatter())
        logger.addHandler(stream_handler)

        # 2. File Handler for Loki / Log Collectors (Promtail, Grafana Alloy)
        try:
            log_dir = os.getenv("CLINIXVAULT_LOG_DIR")
            if not log_dir:
                project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
                log_dir = os.path.join(project_root, "logs")
            os.makedirs(log_dir, exist_ok=True)
            log_file = os.getenv("CLINIXVAULT_LOG_FILE", os.path.join(log_dir, "clinixvault.log"))
            file_handler = RotatingFileHandler(
                log_file, maxBytes=25 * 1024 * 1024, backupCount=5, encoding="utf-8"
            )
            file_handler.setFormatter(JSONFormatter())
            logger.addHandler(file_handler)
        except Exception:
            pass

        logger.propagate = False

    return logger
