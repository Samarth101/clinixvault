---
license: apache-2.0
base_model: Qwen/Qwen2-VL-2B-Instruct
pipeline_tag: image-text-to-text
tags:
- medical
- radiology
- cxr
- peft
- lora
- qwen2-vl
- clinixvault
---

# Samarth101011/clinixvault-qwen2vl-qlora

ClinixVault fine-tuned Qwen2-VL 2B QLoRA adapter for chest radiograph (CXR) report generation and compartmental anatomical breakdown.

## Architecture & Specifications
- **Base Architecture**: `Qwen/Qwen2-VL-2B-Instruct`
- **Finetuning Technique**: Parameter-Efficient Fine-Tuning (PEFT / QLoRA)
- **Domain**: Clinical Artificial Intelligence, Zero-Egress Air-Gapped Workstations
- **Platform**: ClinixVault Edge Intelligence Suite

## Usage with Transformers & PEFT
```python
import torch
from transformers import AutoProcessor, AutoModelForVision2Seq
from peft import PeftModel

base_model_id = "Qwen/Qwen2-VL-2B-Instruct"
adapter_id = "Samarth101011/clinixvault-qwen2vl-qlora"

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
