"""
Zero-PHI Federated LoRA Adapter Aggregator.
Enables multiple air-gapped hospital ward nodes (K3s edge appliances) to merge
decoupled q_proj/v_proj QLoRA adapters via signed weight deltas without sharing patient PHI (ADR-004).
"""

import os
import json
import hmac
import hashlib
from typing import Dict, List, Any, Optional, Tuple
import torch

try:
    from safetensors.torch import load_file as load_safetensors, save_file as save_safetensors
    HAS_SAFETENSORS = True
except ImportError:
    HAS_SAFETENSORS = False

from backend.audit.provenance import provenance_tracker
from inference.shared.logger import get_logger

logger = get_logger("clinixvault.federated_aggregator")


class FederatedAdapterAggregator:
    """
    Coordinates multi-ward Federated Averaging (FedAvg) over LoRA adapter weights.
    Weights are verified via HMAC-SHA256 and aggregated strictly in parameter space.
    """

    def __init__(self, shared_secret_key: Optional[str] = None, secret_key: Optional[str] = None):
        key = secret_key or shared_secret_key or os.getenv("CLINIXVAULT_FEDERATED_KEY", "clinixvault-airgapped-ward-secret")
        self.secret_key = key.encode("utf-8") if isinstance(key, str) else key
        self._staged_updates: List[Dict[str, Any]] = []

    def _serialize_weights_to_bytes(self, node_id: str, weights_delta: Dict[str, Any]) -> bytes:
        hasher = hashlib.sha256(node_id.encode("utf-8"))
        for k in sorted(weights_delta.keys()):
            val = weights_delta[k]
            hasher.update(k.encode("utf-8"))
            if hasattr(val, "tobytes"):
                hasher.update(val.tobytes())
            elif isinstance(val, torch.Tensor):
                hasher.update(val.cpu().numpy().tobytes())
            else:
                hasher.update(str(val).encode("utf-8"))
        return hasher.digest()

    def generate_node_signature(self, node_id: str, weights_delta: Dict[str, Any]) -> str:
        """Computes HMAC-SHA256 signature for a node adapter delta."""
        digest = self._serialize_weights_to_bytes(node_id, weights_delta)
        return hmac.new(self.secret_key, digest, hashlib.sha256).hexdigest()

    def ingest_node_delta(
        self,
        node_id: str,
        weights_delta: Dict[str, Any],
        num_samples: int,
        signature_hex: str,
    ) -> bool:
        """Verifies HMAC signature and ingests adapter delta from a ward mesh node."""
        expected = self.generate_node_signature(node_id, weights_delta)
        if not hmac.compare_digest(expected, signature_hex):
            logger.warning(f"Signature verification failed for node {node_id}")
            return False

        # Convert numpy arrays to torch tensors if needed
        converted = {}
        for k, v in weights_delta.items():
            if isinstance(v, torch.Tensor):
                converted[k] = v
            else:
                converted[k] = torch.from_numpy(v)

        self._staged_updates.append({
            "ward_id": node_id,
            "sample_count": num_samples,
            "state_dict": converted,
            "signature": signature_hex,
        })
        return True

    def aggregate_and_export(self, export_path: str) -> Dict[str, Any]:
        """Aggregates all staged node updates and serializes to safetensors / bin file."""
        if not self._staged_updates:
            raise ValueError("No staged node deltas available to aggregate.")

        participating_nodes = [u["ward_id"] for u in self._staged_updates]
        total_samples = sum(u["sample_count"] for u in self._staged_updates)

        agg_sd, meta = self.aggregate_adapter_state_dicts(self._staged_updates)

        # Save to export_path directly
        os.makedirs(os.path.dirname(os.path.abspath(export_path)), exist_ok=True)
        if HAS_SAFETENSORS and export_path.endswith(".safetensors"):
            save_safetensors(agg_sd, export_path)
        else:
            torch.save(agg_sd, export_path)

        # Clear staged updates
        self._staged_updates.clear()

        return {
            "status": "success",
            "participating_nodes": participating_nodes,
            "total_samples": total_samples,
            "export_path": export_path,
            "parameters_aggregated": len(agg_sd),
            "provenance_hash": meta.get("provenance_hash"),
        }

    def verify_ward_delta_signature(self, weights_bytes: bytes, signature_hex: str) -> bool:
        """Verifies HMAC-SHA256 signature of a ward adapter delta before ingestion."""
        expected = hmac.new(self.secret_key, weights_bytes, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature_hex)

    def sign_adapter_delta(self, weights_bytes: bytes) -> str:
        """Computes HMAC-SHA256 signature for a locally trained adapter delta."""
        return hmac.new(self.secret_key, weights_bytes, hashlib.sha256).hexdigest()

    def aggregate_adapter_state_dicts(
        self,
        ward_updates: List[Dict[str, Any]],
    ) -> Tuple[Dict[str, torch.Tensor], Dict[str, Any]]:
        """
        Performs parameter-space weighted Federated Averaging over LoRA adapters:
        W_agg = sum(n_k / N * W_k) for target modules (q_proj, v_proj).
        
        ward_updates is a list of:
        {
            "ward_id": str,
            "sample_count": int,
            "state_dict": Dict[str, torch.Tensor] (or safetensors file path),
            "signature": Optional[str],
        }
        """
        if not ward_updates:
            raise ValueError("Cannot aggregate empty ward updates list.")

        total_samples = sum(u.get("sample_count", 1) for u in ward_updates)
        if total_samples <= 0:
            total_samples = len(ward_updates)

        # Extract and verify state dicts
        processed_dicts: List[Tuple[Dict[str, torch.Tensor], float]] = []
        ward_manifests: List[Dict[str, Any]] = []

        for update in ward_updates:
            ward_id = update.get("ward_id", "anonymous_ward")
            samples = max(1, update.get("sample_count", 1))
            weight_ratio = samples / total_samples

            sd = update.get("state_dict")
            if isinstance(sd, str) and os.path.exists(sd):
                if HAS_SAFETENSORS and sd.endswith(".safetensors"):
                    sd = load_safetensors(sd)
                else:
                    sd = torch.load(sd, map_location="cpu")
            elif not isinstance(sd, dict):
                raise ValueError(f"Invalid state_dict provided for ward {ward_id}")

            processed_dicts.append((sd, weight_ratio))
            ward_manifests.append({
                "ward_id": ward_id,
                "sample_count": samples,
                "weight_fraction": round(weight_ratio, 4),
            })

        # Average tensors
        base_keys = list(processed_dicts[0][0].keys())
        aggregated_state_dict: Dict[str, torch.Tensor] = {}

        for k in base_keys:
            # Accumulate weighted tensors
            acc_tensor = None
            for sd, ratio in processed_dicts:
                if k not in sd:
                    continue
                tensor = sd[k].to(torch.float32)
                weighted = tensor * ratio
                if acc_tensor is None:
                    acc_tensor = weighted.clone()
                else:
                    acc_tensor += weighted

            if acc_tensor is not None:
                orig_dtype = processed_dicts[0][0][k].dtype
                aggregated_state_dict[k] = acc_tensor.to(orig_dtype)

        # Generate cryptographic provenance manifest
        agg_digest = hashlib.sha256(
            "".join(sorted(base_keys)).encode("utf-8") + str(total_samples).encode("utf-8")
        ).hexdigest()

        provenance = provenance_tracker.generate_provenance_manifest(
            report_content=f"Federated LoRA Aggregation across {len(ward_updates)} wards. Total cases: {total_samples}.",
            input_digest=agg_digest,
            model_name="ClinixVault-Federated-Decoupled-QLoRA",
            model_weights_hash=agg_digest,
            signer_id="federated-aggregator-root",
        )

        metadata = {
            "status": "success",
            "wards_aggregated": len(ward_updates),
            "total_samples": total_samples,
            "ward_breakdown": ward_manifests,
            "parameters_aggregated": len(aggregated_state_dict),
            "provenance_hash": provenance.get("content_sha256"),
        }

        return aggregated_state_dict, metadata

    def save_aggregated_checkpoint(
        self,
        aggregated_state_dict: Dict[str, torch.Tensor],
        output_dir: str,
        base_adapter_config: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Saves aggregated LoRA adapter checkpoint with safetensors and metadata."""
        os.makedirs(output_dir, exist_ok=True)
        out_weights = os.path.join(output_dir, "adapter_model.safetensors")

        if HAS_SAFETENSORS:
            save_safetensors(aggregated_state_dict, out_weights)
        else:
            out_weights = os.path.join(output_dir, "adapter_model.bin")
            torch.save(aggregated_state_dict, out_weights)

        if base_adapter_config:
            cfg_path = os.path.join(output_dir, "adapter_config.json")
            with open(cfg_path, "w") as f:
                json.dump(base_adapter_config, f, indent=2)

        return out_weights
