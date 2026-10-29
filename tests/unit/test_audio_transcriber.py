"""
Unit Tests for Audio Transcriber and Diarization Pipeline.
"""

import os
import pytest
from inference.audio_server.transcriber import WhisperTranscriber, get_transcriber
from inference.audio_server.diarizer import SpeakerDiarizer, get_diarizer


def test_transcriber_initialization():
    transcriber = get_transcriber()
    assert transcriber is not None
    assert transcriber.model_size is not None


def test_transcribe_audio_file(sample_audio_wav_path):
    transcriber = get_transcriber()
    full_text, segments, duration, lang = transcriber.transcribe_file(sample_audio_wav_path)

    assert isinstance(full_text, str)
    assert isinstance(segments, list)
    assert duration >= 0.0
    assert lang in ["en", "auto"]


def test_speaker_diarizer_turn_assignment():
    diarizer = get_diarizer()
    raw_segments = [
        {"start": 0.0, "end": 2.0, "text": "Good morning, what brings you into the clinic today?"},
        {"start": 2.2, "end": 4.5, "text": "Doctor, I have had a cough and fever for three days."},
        {"start": 4.8, "end": 6.5, "text": "Let me examine your chest and listen to your lungs."},
    ]

    assigned = diarizer.assign_speakers_to_segments(raw_segments)
    assert len(assigned) == 3
    assert assigned[0]["speaker"] == "DOCTOR"
    assert assigned[1]["speaker"] == "PATIENT"
    assert assigned[2]["speaker"] == "DOCTOR"
