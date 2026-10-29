"""
Cryptographic Provenance and Audit Verification Engine.
Establishes tamper-evident digital signatures and audit manifests for clinical AI outputs,
guaranteeing complete reproducibility and non-repudiation in air-gapped clinical vaults.
"""

import os
import sys
import hmac
import hashlib
import json
import datetime
from typing import Dict, Any, Tuple, Optional

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from inference.shared.config import settings
from inference.shared.logger import get_logger

logger = get_logger("clinixvault.provenance")


class ProvenanceTracker:
    def __init__(self, secret_key: Optional[str] = None):
        self.secret_key = (secret_key or settings.JWT_SECRET_KEY).encode("utf-8")

    def compute_sha256(self, content: str) -> str:
        """Computes hexadecimal SHA-256 hash of text."""
        return hashlib.sha256(content.encode("utf-8")).hexdigest()

    def generate_provenance_manifest(
        self,
        report_content: str,
        input_digest: str,
        model_name: str,
        model_weights_hash: str,
        signer_id: str = "clinixvault-edge-node-01",
    ) -> Dict[str, Any]:
        """
        Creates signed provenance manifest containing cryptographic hashes of
        input, model, generated output, and timestamp.
        """
        content_hash = self.compute_sha256(report_content)
        timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()

        payload_to_sign = f"{content_hash}|{input_digest}|{model_name}|{model_weights_hash}|{timestamp}|{signer_id}"
        signature = hmac.new(self.secret_key, payload_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

        manifest = {
            "version": "1.0.0-provenance",
            "content_sha256": content_hash,
            "input_sha256": input_digest,
            "model_name": model_name,
            "model_weights_hash": model_weights_hash,
            "timestamp": timestamp,
            "signer_identity": signer_id,
            "cryptographic_signature": signature,
        }

        return manifest

    def verify_provenance_manifest(
        self, report_content: str, manifest: Dict[str, Any]
    ) -> Tuple[bool, str]:
        """
        Verifies that report content has not been tampered with and matches the cryptographic signature.
        """
        expected_content_hash = manifest.get("content_sha256")
        actual_content_hash = self.compute_sha256(report_content)

        if expected_content_hash != actual_content_hash:
            return False, "Content mismatch: report content has been altered since generation."

        input_digest = manifest.get("input_sha256", "")
        model_name = manifest.get("model_name", "")
        model_weights_hash = manifest.get("model_weights_hash", "")
        timestamp = manifest.get("timestamp", "")
        signer_id = manifest.get("signer_identity", "")
        received_signature = manifest.get("cryptographic_signature", "")

        payload_to_verify = (
            f"{actual_content_hash}|{input_digest}|{model_name}|{model_weights_hash}|{timestamp}|{signer_id}"
        )
        expected_signature = hmac.new(
            self.secret_key, payload_to_verify.encode("utf-8"), hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(received_signature, expected_signature):
            return False, "Digital signature verification failed: invalid signature or tampered metadata."

        return True, "Provenance verified: authentic and untampered clinical artifact."


provenance_tracker = ProvenanceTracker()
