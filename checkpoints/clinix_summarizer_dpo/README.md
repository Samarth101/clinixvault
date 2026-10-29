---
license: apache-2.0
base_model: Qwen/Qwen2.5-3B-Instruct
pipeline_tag: text-generation
tags:
- medical
- summarization
- dpo
- alignment
- clinixvault
---

# Samarth101011/clinixvault-summarizer-dpo

ClinixVault DPO-aligned Qwen2.5 clinical summarizer suppressing clinical hallucinations across multi-site inpatient trajectories.

## Architecture & Specifications
- **Base Architecture**: `Qwen/Qwen2.5-3B-Instruct`
- **Finetuning Technique**: Parameter-Efficient Fine-Tuning (PEFT / QLoRA)
- **Domain**: Clinical Artificial Intelligence, Zero-Egress Air-Gapped Workstations
- **Platform**: ClinixVault Edge Intelligence Suite

## Usage with Transformers & PEFT
```python
import torch
from transformers import AutoProcessor, AutoModelForVision2Seq
from peft import PeftModel

base_model_id = "Qwen/Qwen2.5-3B-Instruct"
adapter_id = "Samarth101011/clinixvault-summarizer-dpo"

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
