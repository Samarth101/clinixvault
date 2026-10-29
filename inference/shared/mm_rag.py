#!/usr/bin/env python3
"""
================================================================================
MULTIMODAL RETRIEVAL-AUGMENTED GENERATION (MM-RAG) FOR CLINICAL VLMs
================================================================================
Provides visual and anatomical retrieval-augmented generation for chest X-rays:
1. Vision Backbone Encoder:
   - BioViL-T / BiomedCLIP / ResNet-50 / ViT / timm with fallback projection.
2. Multimodal Visual Index:
   - Vector indexing with fast cosine similarity search and persistent disk storage.
3. Dynamic In-Context Multimodal Prompt Builder:
   - Formats top-K (K=2) nearest visual and clinical exemplars for Qwen2-VL,
     SmolVLM, and LLaVA-1.5.
================================================================================
"""

import os
import sys
import json
import logging
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional, Union

import numpy as np
import torch
from PIL import Image

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("mimic_vlm.mm_rag")


class MedicalVisionEncoder:
    """
    Extracts dense visual embeddings from chest X-ray images.
    Supports BioViL-T, BiomedCLIP, torchvision ResNet-50/ViT, and robust fallback.
    """

    def __init__(
        self,
        backbone: str = "resnet50",
        device: Optional[Union[str, torch.device]] = None,
        embedding_dim: int = 2048,
    ):
        self.device = self._resolve_device(device)
        self.backbone_name = backbone.lower()
        self.embedding_dim = embedding_dim
        self.model = None
        self.preprocess = None
        self._init_encoder()

    def _resolve_device(self, device: Optional[Union[str, torch.device]]) -> torch.device:
        if device is not None:
            return torch.device(device)
        if torch.cuda.is_available():
            return torch.device("cuda")
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return torch.device("mps")
        return torch.device("cpu")

    def _init_encoder(self):
        """Initializes the vision backbone with graceful fallbacks."""
        # 1. Attempt BiomedCLIP via open_clip or transformers
        if "biomed" in self.backbone_name:
            try:
                import open_clip
                model, _, preprocess = open_clip.create_model_and_transforms(
                    "hf-hub:microsoft/BiomedCLIP-PubMedBERT_256-vit_base_patch16_224"
                )
                self.model = model.visual.to(self.device)
                self.model.eval()
                self.preprocess = preprocess
                self.embedding_dim = 512
                logger.info("Initialized BiomedCLIP vision encoder.")
                return
            except Exception as e:
                logger.debug(f"BiomedCLIP via open_clip not loaded ({e}). Trying BioViL-T / torchvision...")

        # 2. Attempt BioViL-T or Medical ViT via HuggingFace AutoModel
        if "biovil" in self.backbone_name or "transformers" in self.backbone_name:
            try:
                from transformers import AutoModel, AutoImageProcessor
                hf_name = "microsoft/BiomedVLP-BioViL-T"
                self.preprocess = AutoImageProcessor.from_pretrained(hf_name)
                self.model = AutoModel.from_pretrained(hf_name, trust_remote_code=True).to(self.device)
                self.model.eval()
                self.embedding_dim = 512
                logger.info("Initialized BioViL-T vision encoder.")
                return
            except Exception as e:
                logger.debug(f"BioViL-T not loaded ({e}). Trying torchvision...")

        # 3. Torchvision ResNet-50 / ViT backbone (universal standard)
        try:
            import torchvision.models as models
            import torchvision.transforms as transforms

            resnet = models.resnet50(weights=models.ResNet50_Weights.DEFAULT)
            # Remove classification head to output 2048-d pool5 features
            modules = list(resnet.children())[:-1]
            self.model = torch.nn.Sequential(*modules).to(self.device)
            self.model.eval()
            self.embedding_dim = 2048

            self.preprocess = transforms.Compose([
                transforms.Resize((224, 224)),
                transforms.ToTensor(),
                transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            ])
            logger.info("Initialized TorchVision ResNet-50 backbone (2048-dim feature space).")
            return
        except Exception as e:
            logger.warning(f"TorchVision backbone failed ({e}). Using deterministic medical feature projection.")

        # 4. Fallback deterministic visual projector
        self.embedding_dim = 512
        logger.info(f"Using deterministic visual feature extractor ({self.embedding_dim}-dim).")

    def to(self, device: Union[str, torch.device]):
        """Moves the underlying vision model and updates internal device."""
        self.device = self._resolve_device(device)
        if self.model is not None:
            self.model.to(self.device)
        return self

    def encode_image(self, image: Union[Image.Image, str, Path]) -> np.ndarray:
        """Encodes a single image into an L2-normalized 1D numpy vector."""
        if isinstance(image, (str, Path)):
            try:
                img = Image.open(image).convert("RGB")
            except Exception as e:
                logger.warning(f"Failed to open image at {image}: {e}. Using blank image.")
                img = Image.new("RGB", (224, 224), color=(0, 0, 0))
        elif isinstance(image, Image.Image):
            img = image.convert("RGB")
        else:
            raise TypeError(f"Unsupported image type: {type(image)}")

        if self.model is not None and self.preprocess is not None:
            try:
                # Dynamically resolve model parameter device and dtype to prevent mismatches
                try:
                    param = next(self.model.parameters())
                    target_device = param.device
                    target_dtype = param.dtype if param.dtype in (torch.float16, torch.bfloat16, torch.float32) else torch.float32
                except (StopIteration, AttributeError):
                    target_device = self.device
                    target_dtype = torch.float32

                tensor = None
                if callable(self.preprocess):
                    try:
                        res = self.preprocess(images=img, return_tensors="pt")
                        if isinstance(res, dict) or hasattr(res, "get"):
                            tensor = res.get("pixel_values", None)
                            if tensor is None:
                                tensor = next(iter(res.values()))
                        else:
                            tensor = res
                    except (TypeError, ValueError, AttributeError):
                        try:
                            tensor = self.preprocess(img)
                        except Exception:
                            tensor = None

                if tensor is None:
                    arr = np.array(img.resize((224, 224))).astype(np.float32) / 255.0
                    tensor = torch.from_numpy(arr).permute(2, 0, 1)

                if isinstance(tensor, torch.Tensor):
                    if tensor.ndim == 3:
                        tensor = tensor.unsqueeze(0)
                else:
                    tensor = torch.as_tensor(tensor)
                    if tensor.ndim == 3:
                        tensor = tensor.unsqueeze(0)

                tensor = tensor.to(device=target_device, dtype=target_dtype)

                with torch.no_grad():
                    feat = self.model(tensor)
                    if hasattr(feat, "pooler_output") and feat.pooler_output is not None:
                        feat = feat.pooler_output
                    elif hasattr(feat, "last_hidden_state"):
                        feat = feat.last_hidden_state.mean(dim=1)
                    feat = feat.flatten(start_dim=1)
                    feat = feat / (feat.norm(dim=-1, keepdim=True) + 1e-9)
                    return feat.squeeze(0).cpu().float().numpy()
            except Exception as e:
                logger.warning(f"Model forward pass failed: {e}. Falling back to visual projection.")

        # Deterministic projection fallback based on multi-scale spatial histogram
        img_thumb = img.resize((32, 32), Image.Resampling.LANCZOS)
        arr = np.asarray(img_thumb, dtype=np.float32) / 255.0
        # Multi-scale statistics: spatial means, standard deviations, and edge gradients
        h_diff = np.diff(arr, axis=0)
        v_diff = np.diff(arr, axis=1)
        raw_feat = np.concatenate([
            arr.flatten()[:256],
            h_diff.flatten()[:128],
            v_diff.flatten()[:128],
        ])
        if len(raw_feat) < self.embedding_dim:
            raw_feat = np.pad(raw_feat, (0, self.embedding_dim - len(raw_feat)))
        else:
            raw_feat = raw_feat[:self.embedding_dim]

        norm = np.linalg.norm(raw_feat)
        return (raw_feat / (norm + 1e-9)).astype(np.float32)

    def encode_batch(self, images: List[Union[Image.Image, str, Path]]) -> np.ndarray:
        """Encodes a list of images into an [N, D] normalized matrix."""
        if not images:
            return np.empty((0, self.embedding_dim), dtype=np.float32)
        vectors = [self.encode_image(img) for img in images]
        return np.vstack(vectors).astype(np.float32)



class MultimodalVisualIndex:
    """
    In-memory and file-backed index of chest X-ray embeddings and paired clinical reports.
    Provides sub-millisecond top-K exemplar retrieval.
    """

    def __init__(self, encoder: Optional[MedicalVisionEncoder] = None):
        self.encoder = encoder or MedicalVisionEncoder()
        self.embeddings: np.ndarray = np.empty((0, self.encoder.embedding_dim), dtype=np.float32)
        self.metadata: List[Dict[str, Any]] = []

    def __len__(self) -> int:
        return len(self.metadata)

    def add_case(
        self,
        image: Union[Image.Image, str, Path],
        report: str,
        image_path: Optional[str] = None,
        study_id: Optional[str] = None,
        extra: Optional[Dict[str, Any]] = None,
    ):
        """Adds a single verified historical case to the index."""
        emb = self.encoder.encode_image(image)
        self.embeddings = np.vstack([self.embeddings, emb[np.newaxis, :]]) if self.embeddings.size else emb[np.newaxis, :]
        meta = {
            "image_path": str(image_path) if image_path else (str(image) if isinstance(image, (str, Path)) else ""),
            "report": str(report).strip(),
            "study_id": str(study_id) if study_id else f"study_{len(self.metadata)}",
        }
        if extra:
            meta.update(extra)
        self.metadata.append(meta)

    def build_index_from_records(
        self,
        records: List[Dict[str, Any]],
        image_key: str = "image_path",
        report_key: str = "report",
        batch_size: int = 32,
    ):
        """Builds index from a list of records with progress logging."""
        logger.info(f"Building MM-RAG visual index across {len(records)} clinical cases...")
        vectors = []
        clean_metadata = []

        for i in range(0, len(records), batch_size):
            chunk = records[i : i + batch_size]
            for item in chunk:
                img_p = item.get(image_key, "")
                rep = item.get(report_key, "")
                if not rep or len(str(rep).strip()) < 10:
                    continue
                try:
                    vec = self.encoder.encode_image(img_p)
                    vectors.append(vec)
                    clean_metadata.append({
                        "image_path": str(img_p),
                        "report": str(rep).strip(),
                        "study_id": str(item.get("study_id", f"case_{len(clean_metadata)}")),
                    })
                except Exception as e:
                    logger.debug(f"Skipping case {img_p}: {e}")

        if vectors:
            self.embeddings = np.vstack(vectors).astype(np.float32)
            self.metadata = clean_metadata
            logger.info(f"Successfully indexed {len(self.metadata)} cases (Matrix shape: {self.embeddings.shape}).")

    def retrieve(
        self,
        query_image: Union[Image.Image, str, Path],
        k: int = 2,
    ) -> List[Dict[str, Any]]:
        """
        Retrieves the top-k most visually and anatomically similar historical cases.
        Returns list of dicts with 'image_path', 'report', 'similarity_score', and 'study_id'.
        """
        if len(self.metadata) == 0 or self.embeddings.shape[0] == 0:
            logger.warning("MM-RAG index is empty. No exemplars retrieved.")
            return []

        q_vec = self.encoder.encode_image(query_image)  # [D]
        if self.embeddings.ndim == 2 and self.embeddings.shape[1] > 0:
            exp_dim = self.embeddings.shape[1]
            if len(q_vec) != exp_dim:
                logger.warning(f"MM-RAG dimension mismatch: query vector ({len(q_vec)}d) vs index ({exp_dim}d). Aligning...")
                if len(q_vec) < exp_dim:
                    q_vec = np.pad(q_vec, (0, exp_dim - len(q_vec)))
                else:
                    q_vec = q_vec[:exp_dim]
                q_vec = (q_vec / (np.linalg.norm(q_vec) + 1e-9)).astype(np.float32)

        # Cosine similarity is dot product of normalized vectors
        scores = np.dot(self.embeddings, q_vec)  # [N]
        top_indices = np.argsort(scores)[::-1][:k]

        results = []
        for idx in top_indices:
            res = dict(self.metadata[idx])
            res["similarity_score"] = float(scores[idx])
            results.append(res)
        return results

    def save(self, filepath: Union[str, Path]):
        """Persists index embeddings and metadata to an NPZ archive."""
        p = Path(filepath)
        p.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            str(p),
            embeddings=self.embeddings,
            metadata=np.array(json.dumps(self.metadata), dtype=object),
        )
        logger.info(f"Saved MM-RAG index to {p} ({len(self.metadata)} cases).")

    def load(self, filepath: Union[str, Path]):
        """Loads index embeddings and metadata from an NPZ archive."""
        p = Path(filepath)
        if not p.exists():
            raise FileNotFoundError(f"MM-RAG index file not found: {p}")
        data = np.load(str(p), allow_pickle=True)
        self.embeddings = data["embeddings"].astype(np.float32)
        raw_meta = data["metadata"].item() if hasattr(data["metadata"], "item") else str(data["metadata"])
        self.metadata = json.loads(raw_meta)
        dim_str = str(self.embeddings.shape[1]) if self.embeddings.ndim > 1 else str(self.encoder.embedding_dim)
        logger.info(f"Loaded MM-RAG index from {p} with {len(self.metadata)} cases (Dim: {dim_str}).")


class MMRAGPromptBuilder:
    """
    Constructs dynamic few-shot in-context prompts for diverse VLM architectures:
    - Qwen2-VL: Chat template message tree with alternating images and reports.
    - SmolVLM: Interleaved <image> tokens and structured reference reports.
    - LLaVA-1.5: Multi-case conversational format with explicit exemplar demarcations.
    """

    @staticmethod
    def clean_exemplar_report(report_text: str, max_chars: int = 350) -> str:
        """Isolates core FINDINGS/IMPRESSION and trims excessively verbose headers."""
        import re
        t = re.sub(r'(?i)indication:\s*.*?(?=(findings|impression|\n\n|$))', '', str(report_text), flags=re.DOTALL)
        m = re.search(r'(?i)(findings.*|impression.*)', t, flags=re.DOTALL)
        if m:
            t = m.group(1)
        t = re.sub(r'\s+', ' ', t).strip()
        if len(t) > max_chars:
            t = t[:max_chars].rsplit('.', 1)[0] + "."
        return t

    @classmethod
    def build_prompt_qwen(
        cls,
        query_image: Image.Image,
        exemplars: List[Dict[str, Any]],
        clinical_indication: str = "",
    ) -> List[Dict[str, Any]]:
        """
        Builds user/assistant messages for Qwen2-VL.
        Includes exemplar images and verified reports as in-context demonstrations.
        """
        messages = []
        for i, ex in enumerate(exemplars, 1):
            ex_img_path = ex.get("image_path", "")
            try:
                ex_img = Image.open(ex_img_path).convert("RGB")
                ex_img.thumbnail((384, 384), Image.Resampling.LANCZOS)
            except Exception:
                ex_img = Image.new("RGB", (224, 224), color=(128, 128, 128))

            ex_rep = cls.clean_exemplar_report(ex.get("report", ""))
            messages.append({
                "role": "user",
                "content": [
                    {"type": "image", "image": ex_img},
                    {"type": "text", "text": f"Reference Case {i}: Provide clinical findings and impression."},
                ],
            })
            messages.append({
                "role": "assistant",
                "content": [
                    {"type": "text", "text": ex_rep},
                ],
            })

        # Target query
        query_text = "Target Case: Describe the clinical findings and diagnostic impression in this chest X-ray."
        if clinical_indication:
            query_text = f"Indication: {clinical_indication}\n" + query_text

        query_thumb = query_image.copy()
        try:
            query_thumb.thumbnail((384, 384), Image.Resampling.LANCZOS)
        except Exception:
            pass

        messages.append({
            "role": "user",
            "content": [
                {"type": "image", "image": query_thumb},
                {"type": "text", "text": query_text},
            ],
        })

        return messages

    @classmethod
    def build_prompt_smolvlm(
        cls,
        query_image: Image.Image,
        exemplars: List[Dict[str, Any]],
        clinical_indication: str = "",
    ) -> Tuple[List[Dict[str, Any]], List[Image.Image]]:
        """
        Builds SmolVLM message list and corresponding image list.
        """
        images = []
        messages = []

        for i, ex in enumerate(exemplars, 1):
            try:
                ex_img = Image.open(ex.get("image_path", "")).convert("RGB")
            except Exception:
                ex_img = Image.new("RGB", (224, 224), color=(128, 128, 128))
            images.append(ex_img)
            ex_rep = cls.clean_exemplar_report(ex.get("report", ""))

            messages.append({
                "role": "user",
                "content": [
                    {"type": "image"},
                    {"type": "text", "text": f"Reference Case {i}: Report clinical observations."},
                ],
            })
            messages.append({
                "role": "assistant",
                "content": [
                    {"type": "text", "text": ex_rep},
                ],
            })

        images.append(query_image)
        query_text = "Target Case: Describe the clinical findings in this chest X-ray."
        if clinical_indication:
            query_text = f"Indication: {clinical_indication}\n" + query_text

        messages.append({
            "role": "user",
            "content": [
                {"type": "image"},
                {"type": "text", "text": query_text},
            ],
        })
        return messages, images

    @classmethod
    def build_prompt_llava(
        cls,
        query_image: Image.Image,
        exemplars: List[Dict[str, Any]],
        clinical_indication: str = "",
    ) -> Tuple[str, List[Image.Image]]:
        """
        Builds LLaVA-1.5 prompt string with <image> tags and image array.
        """
        images = []
        prompt_parts = ["USER: Here are verified clinical radiology reference cases:"]

        for i, ex in enumerate(exemplars, 1):
            try:
                ex_img = Image.open(ex.get("image_path", "")).convert("RGB")
            except Exception:
                ex_img = Image.new("RGB", (224, 224), color=(128, 128, 128))
            images.append(ex_img)
            ex_rep = cls.clean_exemplar_report(ex.get("report", ""))
            prompt_parts.append(f"\n[Reference {i}]: <image>\nReport: {ex_rep}")

        images.append(query_image)
        target_str = "\nNow examine the target chest radiograph: <image>"
        if clinical_indication:
            target_str += f"\nIndication: {clinical_indication}"
        target_str += "\nDescribe the clinical findings and impression.\nASSISTANT: "
        prompt_parts.append(target_str)

        return "".join(prompt_parts), images
