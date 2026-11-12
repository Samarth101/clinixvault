"""
Audio Transcription Engine using faster-whisper (CTranslate2 C++ optimized runtime).
Provides fast local ASR with word-level timestamps and VAD (Voice Activity Detection).
"""

import os
import sys
import tempfile
import io
import time
from typing import List, Dict, Any, Tuple, Optional

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from inference.shared.config import settings
from inference.shared.logger import get_logger

logger = get_logger("clinixvault.audio_transcriber")

# Intercept and patch PyAV >= 14/18 where metadata_errors was removed,
# preventing faster-whisper from throwing TypeError: open() got an unexpected keyword argument 'metadata_errors'
try:
    import av
    if hasattr(av, "open") and not getattr(av.open, "_is_clinix_patched", False):
        _orig_av_open = av.open
        def _safe_av_open(*args, **kwargs):
            kwargs.pop("metadata_errors", None)
            return _orig_av_open(*args, **kwargs)
        _safe_av_open._is_clinix_patched = True
        av.open = _safe_av_open
except Exception:
    pass


def configure_cuda_cublas_libraries():
    """
    CTranslate2 / faster-whisper dynamically links against libcublas.so.12 and libcudnn.
    In Python environments (such as Google Colab or pip nvidia-*-cu12 wheels), these
    shared libraries reside in Python site-packages (e.g. nvidia/cublas/lib).
    This function discovers those directories, adds them to os.environ['LD_LIBRARY_PATH'],
    and preloads libcublasLt.so.12, libcublas.so.12, and libcudnn.so with ctypes.RTLD_GLOBAL
    so CTranslate2's dlopen can immediately resolve them without library-not-found errors.
    """
    if sys.platform != "linux":
        return

    import glob
    import ctypes

    discovered_dirs = []

    # 1. Discover via installed nvidia wheels
    nvidia_modules = [
        "nvidia.cublas",
        "nvidia.cudnn",
        "nvidia.cuda_runtime",
        "nvidia.cuda_nvrtc",
    ]
    for mod_name in nvidia_modules:
        try:
            mod = __import__(mod_name, fromlist=["__file__"])
            if hasattr(mod, "__file__") and mod.__file__:
                lib_dir = os.path.join(os.path.dirname(mod.__file__), "lib")
                if os.path.isdir(lib_dir):
                    discovered_dirs.append(lib_dir)
        except Exception:
            pass

    # 2. Discover via site-packages
    try:
        import site
        s_dirs = list(site.getsitepackages()) if hasattr(site, "getsitepackages") else []
        if hasattr(site, "getusersitepackages"):
            s_dirs.append(site.getusersitepackages())
        for sd in s_dirs:
            discovered_dirs.extend(glob.glob(os.path.join(sd, "nvidia", "*", "lib")))
            discovered_dirs.extend(glob.glob(os.path.join(sd, "torch", "lib")))
    except Exception:
        pass

    # 3. Discover via system CUDA paths
    discovered_dirs.extend(glob.glob("/usr/local/cuda*/lib64"))
    discovered_dirs.extend(glob.glob("/usr/local/cuda*/targets/x86_64-linux/lib"))
    discovered_dirs.extend(glob.glob("/usr/lib/x86_64-linux-gnu"))

    valid_dirs = []
    seen = set()
    for d in discovered_dirs:
        if d and os.path.isdir(d) and d not in seen:
            seen.add(d)
            valid_dirs.append(d)

    # Prepend valid library dirs to LD_LIBRARY_PATH
    if valid_dirs:
        curr_ld = os.environ.get("LD_LIBRARY_PATH", "")
        new_ld = ":".join(valid_dirs + ([curr_ld] if curr_ld else []))
        os.environ["LD_LIBRARY_PATH"] = new_ld

    # 4. Explicitly preload key shared libraries into the process with RTLD_GLOBAL
    # (Note: libcublas requires libcublasLt, so preload libcublasLt FIRST)
    shared_libs = [
        "libcudart.so.12",
        "libcudart.so.11",
        "libcublasLt.so.12",
        "libcublas.so.12",
        "libcublasLt.so.11",
        "libcublas.so.11",
        "libcudnn.so.9",
        "libcudnn.so.8",
    ]

    for lib_name in shared_libs:
        loaded = False
        for dir_path in valid_dirs:
            cand = os.path.join(dir_path, lib_name)
            if os.path.isfile(cand):
                try:
                    ctypes.CDLL(cand, mode=ctypes.RTLD_GLOBAL)
                    loaded = True
                    break
                except Exception:
                    pass
        if not loaded:
            try:
                ctypes.CDLL(lib_name, mode=ctypes.RTLD_GLOBAL)
            except Exception:
                pass


# Execute CUDA library setup at module load
try:
    configure_cuda_cublas_libraries()
except Exception:
    pass


WHISPER_SILENCE_HALLUCINATIONS = {
    "thank you", "thank you.", "thank you very much", "thank you very much.",
    "thank you for watching", "thank you for watching.", "thanks for watching",
    "thanks for watching.", "you", "subtitles by", "bye", "bye.", "subscribe",
    "please subscribe", "like and subscribe", "watching", "amara.org",
    "you don't thank me", "you don't thank me.", "you do not thank me",
    "it's not even one", "it's not even one.", "it's not even one, but the movement is very different",
}


import re
from collections import Counter

def _clean_hallucinatory_repetitions(text: str) -> str:
    """Collapses runaway whisper token repetitions like 'ocemia, ocemia, ocemia' or phrases."""
    if not text:
        return ""
    # 1. Collapse 2+ repeating identical word tokens separated by spaces or punctuation
    cleaned = re.sub(r'\b([A-Za-z0-9_-]+)(?:[\s,./-]+\1\b)+', r'\1', text, flags=re.IGNORECASE)
    # 2. Collapse multi-word repeating phrases
    cleaned = re.sub(r'(\b[\w\s]{3,30}?\b)(?:\s*,\s*|\s+)\1\b', r'\1', cleaned, flags=re.IGNORECASE)
    # 3. Detect and collapse near-duplicate phonetic token clusters (e.g. 'namudarone, neemudarone, neemudarone')
    words = cleaned.split()
    if len(words) >= 4:
        suffixes = [w.strip(".,!?\"'").lower()[-5:] for w in words if len(w) >= 6]
        if suffixes:
            counts = Counter(suffixes)
            most_common_suffix, count = counts.most_common(1)[0]
            if count >= 3 and (count / len(words)) > 0.4:
                seen_stems = set()
                deduped = []
                for w in words:
                    stem = w.strip(".,!?\"'").lower()[-5:]
                    if stem == most_common_suffix:
                        if stem not in seen_stems:
                            seen_stems.add(stem)
                            deduped.append(w)
                    else:
                        deduped.append(w)
                cleaned = " ".join(deduped)
    return cleaned.strip()


class WhisperTranscriber:
    def __init__(self, model_size: Optional[str] = None):
        self.model_size = model_size or settings.WHISPER_MODEL_SIZE
        self.model = None
        self.is_loaded = False
        self._init_model()

    def _check_memory_safety(self) -> Tuple[bool, float, float]:
        """
        Guards unified memory against saturation and system lag.
        Returns: (is_safe, percent_used, available_gb)
        """
        try:
            import psutil
            vm = psutil.virtual_memory()
            avail_gb = round(vm.available / (1024**3), 2)
            # Safe threshold: RAM percent < 88% and at least 1.2 GB available
            is_safe = vm.percent < 88.0 and avail_gb >= 1.2
            return is_safe, vm.percent, avail_gb
        except Exception:
            return True, 50.0, 4.0

    def _init_model(self):
        try:
            import gc
            # Ensure av.open is safe against metadata_errors breaking change
            try:
                import av
                if hasattr(av, "open") and not getattr(av.open, "_is_clinix_patched", False):
                    _orig_av = av.open
                    def _safe_open(*args, **kwargs):
                        kwargs.pop("metadata_errors", None)
                        return _orig_av(*args, **kwargs)
                    _safe_open._is_clinix_patched = True
                    av.open = _safe_open
            except Exception:
                pass

            from faster_whisper import WhisperModel

            # Memory safety check before loading
            is_safe, mem_pct, avail_gb = self._check_memory_safety()
            if not is_safe and "large" in self.model_size.lower():
                logger.warning(
                    f"🚨 [MEMORY GUARD] Host memory pressure high ({mem_pct}% used, {avail_gb}GB available). "
                    f"Preventing system lag: falling back from '{self.model_size}' to 'small.en'."
                )
                self.model_size = "small.en"

            try:
                configure_cuda_cublas_libraries()
            except Exception:
                pass

            device = "cuda" if settings.WHISPER_DEVICE == "cuda" else "cpu"
            compute_type = "float16" if device == "cuda" else "int8"
            self.device = device
            self.compute_type = compute_type
            logger.info(f"Loading faster-whisper model '{self.model_size}' on {device} ({compute_type})...")
            
            try:
                self.model = WhisperModel(
                    self.model_size,
                    device=device,
                    compute_type=compute_type,
                    cpu_threads=settings.LLM_N_THREADS,
                )
            except Exception as init_err:
                if device == "cuda":
                    logger.warning(
                        f"🚨 Faster-Whisper failed to initialize on CUDA ({init_err}). "
                        f"Automatically falling back to CPU int8 runtime."
                    )
                    self.device = "cpu"
                    self.compute_type = "int8"
                    cpu_init_size = "small.en" if "large" in self.model_size.lower() else self.model_size
                    self.model_size = cpu_init_size
                    self.model = WhisperModel(
                        cpu_init_size,
                        device="cpu",
                        compute_type="int8",
                        cpu_threads=settings.LLM_N_THREADS,
                    )
                else:
                    raise init_err

            # Post-load memory check
            post_safe, post_pct, post_avail = self._check_memory_safety()
            if not post_safe and "large" in self.model_size.lower():
                logger.warning(
                    f"🚨 [MEMORY GUARD] Post-load unified memory saturated ({post_pct}% used, {post_avail}GB free). "
                    f"Terminating '{self.model_size}' to prevent computer lag and falling back to 'small.en'..."
                )
                del self.model
                self.model = None
                gc.collect()
                self.model_size = "small.en"
                self.model = WhisperModel(
                    self.model_size,
                    device=self.device,
                    compute_type=self.compute_type,
                    cpu_threads=settings.LLM_N_THREADS,
                )

            self.is_loaded = True
            logger.info(f"faster-whisper model '{self.model_size}' successfully active.")
        except ImportError:
            logger.warning("faster_whisper not installed. Falling back to ambient speech processor.")
        except Exception as e:
            logger.warning(f"faster_whisper model initialization warning ({e}). Using edge speech pipeline.")

    def transcribe_file(
        self,
        audio_path: str,
        language: str = "en",
        hotwords: Optional[str] = None,
        initial_prompt: Optional[str] = None,
        beam_size: int = 1,
        word_timestamps: bool = False,
    ) -> Tuple[str, List[Dict[str, Any]], float, str]:
        """
        Transcribes audio file with optional hotword boosting from clinical knowledge graph.
        Returns: (full_text, segments_list, duration, detected_language)
        """
        if self.is_loaded and self.model is not None:
            transcribe_kwargs: Dict[str, Any] = {
                "beam_size": beam_size,
                "language": language if language != "auto" else None,
                "vad_filter": True,
                "vad_parameters": dict(min_silence_duration_ms=300, speech_pad_ms=150),
                "word_timestamps": word_timestamps,
                "condition_on_previous_text": False,
                "repetition_penalty": 1.25,
                "no_repeat_ngram_size": 3,
                "no_speech_threshold": 0.6,
                "hallucination_silence_threshold": 2.0,
            }
            if hotwords:
                transcribe_kwargs["hotwords"] = hotwords
            if initial_prompt:
                transcribe_kwargs["initial_prompt"] = initial_prompt

            def _parse_and_collect_segments(model_to_use):
                segments_generator, info = model_to_use.transcribe(
                    audio_path,
                    **transcribe_kwargs,
                )
                results = []
                full_parts = []
                for seg in segments_generator:
                    if getattr(seg, "no_speech_prob", 0.0) > 0.65 or seg.avg_logprob < -1.2:
                        continue
                    seg_text = seg.text.strip()
                    cleaned_seg = seg_text.strip(".,!?\"'").lower()
                    if not cleaned_seg or cleaned_seg in WHISPER_SILENCE_HALLUCINATIONS:
                        continue
                    # Deduplicate any runaway repetitions within segment
                    seg_text = _clean_hallucinatory_repetitions(seg_text)
                    if not seg_text:
                        continue
                    words = []
                    if seg.words:
                        for w in seg.words:
                            words.append(
                                {"word": w.word, "start": w.start, "end": w.end, "probability": w.probability}
                            )
                    results.append(
                        {
                            "start": seg.start,
                            "end": seg.end,
                            "text": seg_text,
                            "confidence": seg.avg_logprob,
                            "words": words,
                        }
                    )
                    full_parts.append(seg_text)
                return results, full_parts, info

            try:
                results, full_parts, info = _parse_and_collect_segments(self.model)
            except Exception as e:
                err_str = str(e).lower()
                is_gpu_err = any(cue in err_str for cue in ("libcublas", "cuda", "cublas", "cudnn", "gpu", "out of memory"))
                if getattr(self, "device", "cpu") == "cuda" or is_gpu_err:
                    logger.warning(
                        f"🚨 Faster-Whisper CUDA runtime error ({e}). "
                        f"Dynamically migrating to CPU int8 runtime for uninterrupted speech recognition..."
                    )
                    try:
                        from faster_whisper import WhisperModel
                        self.device = "cpu"
                        self.compute_type = "int8"
                        cpu_size = "small.en" if "large" in self.model_size.lower() else self.model_size
                        self.model = WhisperModel(
                            cpu_size,
                            device="cpu",
                            compute_type="int8",
                            cpu_threads=max(2, min(4, os.cpu_count() or 2)),
                        )
                        self.model_size = cpu_size
                        results, full_parts, info = _parse_and_collect_segments(self.model)
                    except Exception as fallback_err:
                        logger.warning(f"Audio transcription CPU fallback execution failed ({fallback_err}). Returning empty transcription.")
                        return "", [], 0.0, language or "en"
                else:
                    logger.warning(f"Audio transcription execution failed ({e}). Returning empty transcription.")
                    return "", [], 0.0, language or "en"

            raw_full = " ".join(full_parts).strip()
            full_text = _clean_hallucinatory_repetitions(raw_full)
            if full_text.strip(".,!?\"'").lower() in WHISPER_SILENCE_HALLUCINATIONS:
                return "", [], info.duration, info.language

            return full_text, results, info.duration, info.language

        # When no neural model is available or audio is silent, return empty without hallucination
        return "", [], 0.0, "en"


_global_transcriber: Optional[WhisperTranscriber] = None


def get_transcriber() -> WhisperTranscriber:
    global _global_transcriber
    if _global_transcriber is None:
        _global_transcriber = WhisperTranscriber()
    return _global_transcriber
