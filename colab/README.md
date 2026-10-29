# 🚀 ClinixVault Google Colab GPU Backend & Tunneling Guide

This module provides a turnkey solution to run the complete ClinixVault backend on **Google Colab GPUs** (T4, L4, or A100), with zero-account Cloudflare Tunneling, dual model sourcing (Google Drive vs Hugging Face), and continuous codebase synchronization.

---

## 🏗️ Architecture

```
                                      +---------------------------------------------+
                                      |           Google Colab Runtime              |
                                      |                                             |
[ Local ClinixVault React Frontend ]  |   [ Cloudflare Tunnel: *.trycloudflare.com] |
        (Port 5173)                   |                        |                    |
             |                        |                        v                    |
             +==== (HTTPS & WSS) ====>|   [ FastAPI Gateway (:8000) ]               |
                                      |        |                |                   |
                                      |        v                v                   |
                                      |   [ Faster-Whisper ]  [ Qwen2-VL / LLM ]    |
                                      |   (large-v3-turbo)    (CUDA fp16)           |
                                      |        |                |                   |
                                      |   [ GPU VRAM Watchdog (Auto-OOM Guard) ]    |
                                      +---------------------------------------------+
                                                               |
                                            (Prometheus & Loki Remote Write)
                                                               v
                                                [ Grafana Cloud Dashboard ]
```

---

## ⚡ Quick Start (5 Minutes)

### 1. Open Notebook in Google Colab
1. Go to [Google Colab](https://colab.research.google.com/).
2. Click **File** $\rightarrow$ **Upload notebook**.
3. Select `colab/clinixvault_colab_backend.ipynb` from your local ClinixVault project.
4. Set hardware accelerator: **Runtime** $\rightarrow$ **Change runtime type** $\rightarrow$ select **T4 GPU** (or A100).

### 2. Run Step 1 & 2
- Executes repository clone/sync and fast dependency installation (`<60s`).

### 3. Choose Model Sourcing (Drive vs Hugging Face)
- **Option A (Google Drive - Recommended for Zero Bandwidth)**:
  - Put your `checkpoints/` folder in Google Drive: `/content/drive/MyDrive/clinixvault_models/`.
  - Set `MODEL_SOURCE = "drive"`.
  - Boots in seconds without downloading multi-gigabyte files.
- **Option B (Hugging Face Hub)**:
  - First, publish your local fine-tuned checkpoints to HF using our automated publisher:
    ```bash
    export HF_TOKEN="hf_xxxxxxxxxxxxxxxxxxxxxx"
    python scripts/push_models_to_hf.py --all --org <your_hf_username>
    ```
  - Set `MODEL_SOURCE = "huggingface"` and enter your HF username in Colab.

### 4. Start Backend & Copy Cloudflare Tunnel URL
- Run Step 5.
- The runner automatically starts `cloudflared` and outputs:
  ```
  🎉 CLINIXVAULT PUBLIC BACKEND IS LIVE ON GOOGLE COLAB!
  🔗 HTTPS Base URL:   https://subdomain-xxxx.trycloudflare.com
  🎙️ WebSocket Stream: wss://subdomain-xxxx.trycloudflare.com/api/v1/scribe/stream
  📊 OpenMetrics:      https://subdomain-xxxx.trycloudflare.com/metrics
  ```

### 5. Connect Your Local Frontend
In your local ClinixVault project root, edit `frontend/.env.local`:
```bash
VITE_API_URL=https://subdomain-xxxx.trycloudflare.com
```
Then run:
```bash
npm run dev --prefix frontend
```
Your local React workstation is now powered by Google Colab's GPU backend!

---

## 🔄 Live Code Syncing (Without Session Restarts)

When you make changes to Python backend code locally and push to Git:
1. Push to your repo: `git push origin main`
2. In Colab, simply run the **Step 6: Code Sync Cell**:
   ```bash
   !python colab/colab_runner.py --sync-git
   ```
Changes are pulled instantly into your active session without resetting GPU memory or re-installing packages.

---

## 🛡️ GPU VRAM Safety Guard

The background `ColabGPUWatchdog` actively monitors CUDA memory:
- If VRAM utilization reaches **88%**, it automatically triggers `torch.cuda.empty_cache()` and garbage collection.
- Prevents Colab CUDA Out-of-Memory crashes during heavy multi-modal inference.
