#!/usr/bin/env python3
"""
ClinixVault Hugging Face Hub Model Publisher.

Uploads fine-tuned ClinixVault weights (QLoRA adapters and merged checkpoints)
from local checkpoints/ directory to the Hugging Face Model Hub with automatic
metadata generation, model card README, and verification.

Usage:
    # 1. Login with HF Token (or set HF_TOKEN environment variable)
    export HF_TOKEN="hf_xxxxxxxxxxxxxxxxxxxxxx"

    # 2. Push default fine-tuned VLM adapter
    python scripts/push_models_to_hf.py --model qwen2vl-qlora --repo-id <username>/clinixvault-qwen2vl-qlora

    # 3. Push clinical summarizer adapter
    python scripts/push_models_to_hf.py --model summarizer-qlora --repo-id <username>/clinixvault-summarizer-qlora

    # 4. Push all models interactively
    python scripts/push_models_to_hf.py --all --org <username_or_org>
"""

import os
import sys
import argparse
from pathlib import Path
from typing import Dict, Any, Optional

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CHECKPOINTS_DIR = PROJECT_ROOT / "checkpoints"

SUPPORTED_MODELS: Dict[str, Dict[str, Any]] = {
    "qwen2vl-qlora": {
        "dir_name": "qwen2_vl_mimic_cxr_lora",
        "default_name": "clinixvault-qwen2vl-qlora",
        "description": "ClinixVault fine-tuned Qwen2-VL 2B QLoRA adapter for chest radiograph (CXR) report generation and compartmental anatomical breakdown.",
        "base_model": "Qwen/Qwen2-VL-2B-Instruct",
        "pipeline_tag": "image-text-to-text",
        "tags": ["medical", "radiology", "cxr", "peft", "lora", "qwen2-vl", "clinixvault"],
    },
    "summarizer-qlora": {
        "dir_name": "clinix_summarizer_qwen2.5_lora",
        "default_name": "clinixvault-summarizer-qlora",
        "description": "ClinixVault fine-tuned Qwen2.5 3B QLoRA adapter for deterministic clinical progress notes, multi-hospital EMR summarization, and SOAP synthesis.",
        "base_model": "Qwen/Qwen2.5-3B-Instruct",
        "pipeline_tag": "text-generation",
        "tags": ["medical", "clinical-nlp", "summarization", "soap-notes", "peft", "lora", "clinixvault"],
    },
    "qwen2vl-dpo": {
        "dir_name": "qwen2_vl_mimic_cxr_dpo",
        "default_name": "clinixvault-qwen2vl-dpo",
        "description": "ClinixVault DPO-aligned Qwen2-VL 2B adapter optimized for medical factuality and hallucination suppression in radiograph interpretation.",
        "base_model": "Qwen/Qwen2-VL-2B-Instruct",
        "pipeline_tag": "image-text-to-text",
        "tags": ["medical", "radiology", "dpo", "alignment", "clinixvault"],
    },
    "summarizer-dpo": {
        "dir_name": "clinix_summarizer_dpo",
        "default_name": "clinixvault-summarizer-dpo",
        "description": "ClinixVault DPO-aligned Qwen2.5 clinical summarizer suppressing clinical hallucinations across multi-site inpatient trajectories.",
        "base_model": "Qwen/Qwen2.5-3B-Instruct",
        "pipeline_tag": "text-generation",
        "tags": ["medical", "summarization", "dpo", "alignment", "clinixvault"],
    },
    "smolvlm-qlora": {
        "dir_name": "smolvlm_mimic_cxr_lora",
        "default_name": "clinixvault-smolvlm-qlora",
        "description": "ClinixVault ultra-lightweight SmolVLM-256M QLoRA adapter for edge-constrained and mobile clinical vision analysis.",
        "base_model": "HuggingFaceTB/SmolVLM-Instruct",
        "pipeline_tag": "image-text-to-text",
        "tags": ["medical", "edge-ai", "smolvlm", "peft", "clinixvault"],
    },
}


def generate_model_card(model_key: str, repo_id: str, info: Dict[str, Any]) -> str:
    tags_yaml = "\n".join(f"- {t}" for t in info["tags"])
    return f"""---
license: apache-2.0
base_model: {info['base_model']}
pipeline_tag: {info['pipeline_tag']}
tags:
{tags_yaml}
---

# {repo_id}

{info['description']}

## Architecture & Specifications
- **Base Architecture**: `{info['base_model']}`
- **Finetuning Technique**: Parameter-Efficient Fine-Tuning (PEFT / QLoRA)
- **Domain**: Clinical Artificial Intelligence, Zero-Egress Air-Gapped Workstations
- **Platform**: ClinixVault Edge Intelligence Suite

## Usage with Transformers & PEFT
```python
import torch
from transformers import AutoProcessor, AutoModelForVision2Seq
from peft import PeftModel

base_model_id = "{info['base_model']}"
adapter_id = "{repo_id}"

# 1. Load Base Model
base_model = AutoModelForVision2Seq.from_pretrained(
    base_model_id,
    torch_dtype=torch.float16,
    device_map="auto"
)

# 2. Attach ClinixVault Fine-Tuned Adapter
model = PeftModel.from_pretrained(base_model, adapter_id)
model.eval()
print("ClinixVault model ready for inference.")
```

## Clinical Safety Protocol
This model is designed for clinical decision support under licensed clinical supervision.
Verified under the ClinixVault Zero-Data-Egress Clinical Verification Framework.
"""


def push_model(model_key: str, repo_id: str, token: str, private: bool = False, dry_run: bool = False):
    info = SUPPORTED_MODELS[model_key]
    local_dir = CHECKPOINTS_DIR / info["dir_name"]

    if not local_dir.exists():
        print(f"❌ Error: Local directory '{local_dir}' does not exist.")
        return False

    files = list(local_dir.glob("*"))
    if not files:
        print(f"❌ Error: Directory '{local_dir}' is empty.")
        return False

    print(f"\n========================================================")
    print(f"🚀 ClinixVault Hugging Face Publisher")
    print(f"========================================================")
    print(f"📦 Model Key:      {model_key}")
    print(f"📁 Local Source:   {local_dir} ({len(files)} files)")
    print(f"🌐 Target Repo:    {repo_id}")
    print(f"🔒 Visibility:     {'Private' if private else 'Public'}")
    print(f"========================================================")

    if dry_run:
        print("🔍 [DRY RUN] Verification successful. Files ready to upload:")
        for f in files:
            size_mb = round(f.stat().st_size / (1024 * 1024), 2)
            print(f"   - {f.name} ({size_mb} MB)")
        return True

    try:
        from huggingface_hub import HfApi, create_repo
    except ImportError:
        print("❌ huggingface_hub is not installed. Install via: pip install huggingface_hub")
        return False

    api = HfApi(token=token)

    # 1. Ensure repo exists
    print(f"⚙️  Ensuring repository '{repo_id}' exists on Hugging Face Hub...")
    try:
        create_repo(repo_id=repo_id, token=token, private=private, exist_ok=True)
    except Exception as e:
        print(f"⚠️  Repo create notice: {e}")

    # 2. Write / Upload README model card
    readme_content = generate_model_card(model_key, repo_id, info)
    readme_path = local_dir / "README.md"
    readme_path.write_text(readme_content, encoding="utf-8")
    print(f"📝 Generated standardized medical model card README.md")

    # 3. Upload directory
    print(f"⬆️  Uploading files to https://huggingface.co/{repo_id}...")
    api.upload_folder(
        folder_path=str(local_dir),
        repo_id=repo_id,
        commit_message=f"Upload ClinixVault fine-tuned weights for {model_key}",
        token=token,
    )

    print(f"✅ Successfully published {model_key} to: https://huggingface.co/{repo_id}")
    return True


def main():
    parser = argparse.ArgumentParser(description="Publish ClinixVault fine-tuned models to Hugging Face Hub")
    parser.add_argument(
        "--model",
        choices=list(SUPPORTED_MODELS.keys()),
        default="qwen2vl-qlora",
        help="Model checkpoint to publish",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Publish all supported ClinixVault models under the given org / user prefix",
    )
    parser.add_argument(
        "--repo-id",
        type=str,
        default=None,
        help="Full HF repo ID (e.g., 'your-username/clinixvault-qwen2vl-qlora')",
    )
    parser.add_argument(
        "--org",
        type=str,
        default=None,
        help="Hugging Face username or organization prefix (e.g. 'samarthb')",
    )
    parser.add_argument(
        "--token",
        type=str,
        default=None,
        help="Hugging Face API token (defaults to HF_TOKEN or HUGGINGFACE_TOKEN env var)",
    )
    parser.add_argument(
        "--private",
        action="store_true",
        help="Create repository as private",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate directories and files without uploading",
    )

    args = parser.parse_args()

    token = args.token or os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACE_TOKEN")
    if not token and not args.dry_run:
        print("❌ Error: No Hugging Face token provided.")
        print("   Set HF_TOKEN environment variable: export HF_TOKEN='hf_...'")
        print("   Or pass via --token flag.")
        sys.exit(1)

    if args.all:
        if not args.org:
            print("❌ Error: Must specify --org <username_or_org> when using --all")
            sys.exit(1)
        for key, info in SUPPORTED_MODELS.items():
            target_repo = f"{args.org}/{info['default_name']}"
            push_model(key, target_repo, token, private=args.private, dry_run=args.dry_run)
    else:
        repo_id = args.repo_id
        if not repo_id:
            org = args.org or "ClinixVault"
            repo_id = f"{org}/{SUPPORTED_MODELS[args.model]['default_name']}"
        push_model(args.model, repo_id, token, private=args.private, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
