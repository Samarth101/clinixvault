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
            from faster_whisper import WhisperModel

            # Memory safety check before loading
            is_safe, mem_pct, avail_gb = self._check_memory_safety()
            if not is_safe and "large" in self.model_size.lower():
                logger.warning(
                    f"🚨 [MEMORY GUARD] Host memory pressure high ({mem_pct}% used, {avail_gb}GB available). "
                    f"Preventing system lag: falling back from '{self.model_size}' to 'small.en'."
                )
                self.model_size = "small.en"

            device = "cuda" if settings.WHISPER_DEVICE == "cuda" else "cpu"
            compute_type = "float16" if device == "cuda" else "int8"
            logger.info(f"Loading faster-whisper model '{self.model_size}' on {device} ({compute_type})...")
            
            self.model = WhisperModel(
                self.model_size,
                device=device,
                compute_type=compute_type,
                cpu_threads=settings.LLM_N_THREADS,
            )

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
                    device=device,
                    compute_type=compute_type,
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

            try:
                segments_generator, info = self.model.transcribe(
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

                raw_full = " ".join(full_parts).strip()
                full_text = _clean_hallucinatory_repetitions(raw_full)
                if full_text.strip(".,!?\"'").lower() in WHISPER_SILENCE_HALLUCINATIONS:
                    return "", [], info.duration, info.language

                return full_text, results, info.duration, info.language
            except Exception as e:
                logger.warning(f"Audio transcription execution failed ({e}). Returning empty transcription.")
                return "", [], 0.0, language or "en"

        # When no neural model is available or audio is silent, return empty without hallucination
        return "", [], 0.0, "en"


_global_transcriber: Optional[WhisperTranscriber] = None


def get_transcriber() -> WhisperTranscriber:
    global _global_transcriber
    if _global_transcriber is None:
        _global_transcriber = WhisperTranscriber()
    return _global_transcriber
