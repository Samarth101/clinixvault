---
title: ClinixVault GPU Inference Engine
emoji: 🏥
colorFrom: blue
colorTo: indigo
sdk: gradio
sdk_version: 4.44.0
app_file: app.py
pinned: false
license: mit
short_description: ZeroGPU High-Throughput Clinical VLM & AVS Inference Node
---

# 🏥 ClinixVault Enterprise — GPU Inference Node

High-throughput, ZeroGPU-accelerated clinical intelligence inference engine for **ClinixVault Enterprise**.

This Space acts as **Priority Tier 2 (P2)** in ClinixVault's automated multi-provider failover architecture:

$$\text{Google Colab GPU (P1)} \longrightarrow \text{Hugging Face Spaces ZeroGPU (P2)} \longrightarrow \text{Sovereign Local Edge (P3)}$$

---

## 🚀 Features

- **ZeroGPU Acceleration**: Dynamically allocates Nvidia A100 GPU compute via `@spaces.GPU(duration=120)` during active inference requests.
- **Two-Stage VLM Radiology Interpretation**: Multi-label thoracic pathology assessment (Cardiomegaly, Effusion, Consolidation, Atelectasis, Pneumothorax, Fracture) and structured report synthesis.
- **Plain-Language After-Visit Summaries (AVS)**: Lay-audience translation tailored to 6th-grade reading level.
- **Clinical Content Sufficiency Gate**: Built-in verification filter rejecting non-clinical noise, gibberish, or insufficient inputs (e.g. "jhbk").
- **Dynamic Failover Telemetry**: Real-time heartbeat probe at `/api/v1/health` with accelerator metadata.

---

## 📡 API Endpoints

| Endpoint | Method | Description |
| :--- | :---: | :--- |
| `/api/v1/health` | `GET` | Health telemetry and GPU status probe |
| `/api/v1/radiology/generate` | `POST` | ZeroGPU thoracic radiograph interpretation |
| `/api/v1/summarize/patient` | `POST` | Plain-language After-Visit Summary (AVS) synthesis |
| `/api/v1/summarize/document` | `POST` | Sovereign document summarizer with flowsheet extraction |
| `/ui` or `/` | `GET` | Interactive Gradio telemetry dashboard |

---

## ⚡ Handling the 5-Minute ZeroGPU Quota

Hugging Face Spaces provides dynamic ZeroGPU access (Nvidia A100 slices) with a rolling free-tier quota (~5 minutes of continuous inference computation per burst window). 

ClinixVault handles this gracefully:
1. **Dynamic Function-Level Allocation**: ZeroGPU compute is consumed *only* during the seconds an inference request is actively running—not during idle listening.
2. **Automated Tiered Failover**: If the Hugging Face ZeroGPU quota is exhausted (HTTP 429 or 504), ClinixVault's frontend failover agent instantly falls back to your **Sovereign Local Edge Node (`http://127.0.0.1:8000`)** without interrupting clinical workflows.
3. **Automatic Recovery Promotion**: When the ZeroGPU quota recovers or your Colab tunnel boots back up, ClinixVault's background probe automatically promotes active inference back to the GPU tier.

---

## 🔗 How to Connect to Your ClinixVault Frontend

1. In your Hugging Face Space, click the **Settings / More Options** menu (top right) and copy the **Direct Space URL**:
   ```
   https://<your-username>-<your-space-name>.hf.space
   ```
2. Open your deployed ClinixVault frontend (on Vercel or locally).
3. Click the **Connection Status Pill** in the header bar (or press `Cmd/Ctrl + K` -> Backend Telemetry).
4. Paste your Space URL into the **Hugging Face Spaces GPU Inference Node** card and click **Test Ping**.
5. Click **Save & Connect**.
