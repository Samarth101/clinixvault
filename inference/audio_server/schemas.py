"""
Pydantic Schemas for Audio Transcription and Speaker Diarization Microservice.
"""

from typing import List, Optional
from pydantic import BaseModel, Field


class WordTimestamp(BaseModel):
    word: str
    start: float
    end: float
    probability: float


class DialogueSegment(BaseModel):
    speaker: str = Field(description="Speaker label: e.g. DOCTOR, PATIENT, SPEAKER_00")
    start: float = Field(description="Segment start time in seconds")
    end: float = Field(description="Segment end time in seconds")
    text: str = Field(description="Transcribed segment text")
    confidence: float = Field(default=0.95)
    words: Optional[List[WordTimestamp]] = None


class AudioTranscriptionRequest(BaseModel):
    audio_base64: Optional[str] = Field(default=None, description="Base64 encoded audio file (wav, mp3, ogg)")
    audio_path: Optional[str] = Field(default=None, description="Server filepath to raw audio")
    language: Optional[str] = Field(default="en")
    enable_diarization: bool = Field(default=True)
    hotwords: Optional[str] = Field(default=None, description="Neo4j/ontology-primed medical vocabulary hotwords")
    initial_prompt: Optional[str] = Field(default=None, description="Clinical context prompt for Whisper ASR priming")
    patient_id: Optional[str] = Field(default=None, description="Optional patient identifier to look up active graph hotwords")


class AudioTranscriptionResponse(BaseModel):
    full_transcript: str
    segments: List[DialogueSegment]
    duration_seconds: float
    detected_language: str
    diarization_enabled: bool
    latency_ms: float


class StreamingAudioMessage(BaseModel):
    event: str = Field(description="'chunk', 'finalize', 'ping'")
    audio_base64: Optional[str] = None
    is_last: bool = False


class StreamingTranscriptionUpdate(BaseModel):
    event: str = Field(description="'partial', 'segment', 'complete'")
    speaker: str
    text: str
    start: float
    end: float
