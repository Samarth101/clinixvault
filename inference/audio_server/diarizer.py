"""
Speaker Diarization Engine integrating pyannote.audio.
Performs neural speaker clustering and aligns temporal diarization tracks
with ASR word/phrase timestamps into DOCTOR vs PATIENT roles.
"""

import os
import sys
import logging
from typing import List, Dict, Any, Optional, Tuple

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from inference.shared.logger import get_logger

logger = get_logger("clinixvault.audio_diarizer")


class SpeakerDiarizer:
    def __init__(self):
        self.pipeline = None
        self.is_loaded = False
        self._init_pipeline()

    def _init_pipeline(self):
        hf_token = os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACE_TOKEN")
        try:
            from pyannote.audio import Pipeline
            if hf_token:
                logger.info("Initializing pyannote.audio speaker-diarization-3.1 pipeline...")
                self.pipeline = Pipeline.from_pretrained(
                    "pyannote/speaker-diarization-3.1", use_auth_token=hf_token
                )
                self.is_loaded = True
            else:
                logger.info("HF_TOKEN not provided; using clinical conversational diarizer.")
        except Exception as e:
            logger.warning(f"pyannote.audio pipeline unavailable ({e}). Using edge conversational heuristic.")

    def diarize_audio(self, audio_path: str) -> List[Dict[str, Any]]:
        """
        Computes speaker intervals: [{'start': 0.0, 'end': 2.5, 'speaker': 'SPEAKER_00'}]
        """
        if self.is_loaded and self.pipeline is not None:
            try:
                diarization = self.pipeline(audio_path)
                intervals = []
                for turn, _, speaker in diarization.itertracks(yield_label=True):
                    intervals.append({"start": turn.start, "end": turn.end, "speaker": speaker})
                return intervals
            except Exception as e:
                logger.warning(f"pyannote processing error: {e}")

        # Deterministic conversational diarization fallback
        return []

    def assign_speakers_to_segments(
        self, segments: List[Dict[str, Any]], intervals: Optional[List[Dict[str, Any]]] = None
    ) -> List[Dict[str, Any]]:
        """
        Aligns transcription segments with diarization intervals.
        Classifies speakers as DOCTOR vs PATIENT based on interrogative/clinical cues.
        """
        enriched_segments = []

        doctor_cues = ["what brings you", "take a deep breath", "let me examine", "listen to", "we will order", "prescription", "exam"]
        patient_cues = ["i feel", "i have", "my chest", "hurts", "days ago", "doctor", "i am taking"]

        current_speaker = "DOCTOR"
        for idx, seg in enumerate(segments):
            seg_start = seg.get("start", 0.0)
            seg_end = seg.get("end", 0.0)
            text_lower = seg.get("text", "").lower()

            assigned_speaker = None
            if intervals:
                # Find interval with maximal overlap
                best_overlap = 0.0
                for inv in intervals:
                    overlap_start = max(seg_start, inv["start"])
                    overlap_end = min(seg_end, inv["end"])
                    overlap = max(0.0, overlap_end - overlap_start)
                    if overlap > best_overlap:
                        best_overlap = overlap
                        assigned_speaker = inv["speaker"]

            if not assigned_speaker:
                # Use clinical alternating turn & linguistic heuristics
                if any(cue in text_lower for cue in doctor_cues):
                    current_speaker = "DOCTOR"
                elif any(cue in text_lower for cue in patient_cues):
                    current_speaker = "PATIENT"
                else:
                    # Alternate turn if prior segment was by opposite speaker
                    current_speaker = "DOCTOR" if idx % 2 == 0 else "PATIENT"
                assigned_speaker = current_speaker

            enriched = dict(seg)
            enriched["speaker"] = assigned_speaker
            enriched_segments.append(enriched)

        return enriched_segments


_global_diarizer: Optional[SpeakerDiarizer] = None


def get_diarizer() -> SpeakerDiarizer:
    global _global_diarizer
    if _global_diarizer is None:
        _global_diarizer = SpeakerDiarizer()
    return _global_diarizer
