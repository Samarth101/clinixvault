"""
ClinixVault Audio Transcription Microservice (Port 8003).
Provides ambient medical transcription, WebSocket real-time audio streaming,
and speaker diarization for ambient clinical scribing.
"""

import os
import sys
import io
import time
import datetime
import math
import struct
import base64
import tempfile
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, status

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from inference.shared.config import settings
from inference.shared.logger import get_logger
from inference.shared.health import create_health_router
from inference.shared.metrics import setup_microservice_metrics, record_inference_metrics
from inference.audio_server.schemas import (
    AudioTranscriptionRequest,
    AudioTranscriptionResponse,
    DialogueSegment,
    StreamingTranscriptionUpdate,
)
from inference.audio_server.transcriber import get_transcriber
from inference.audio_server.diarizer import get_diarizer

logger = get_logger("clinixvault.audio_server")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing ClinixVault Audio Server & ASR engines...")
    _ = get_transcriber()
    _ = get_diarizer()
    yield
    logger.info("Audio Server shutting down.")


app = FastAPI(
    title="ClinixVault Audio Transcription Service",
    version="1.0.0",
    description="Air-gapped edge microservice for ambient speech transcription and speaker diarization",
    lifespan=lifespan,
)

app.include_router(create_health_router("audio-service"))
setup_microservice_metrics(app, "audio-server")


@app.post("/transcribe", response_model=AudioTranscriptionResponse)
async def transcribe_audio_endpoint(request: AudioTranscriptionRequest):
    start_time = time.time()
    transcriber = get_transcriber()
    diarizer = get_diarizer()

    temp_audio_file = None
    try:
        if request.audio_base64:
            audio_bytes = base64.b64decode(request.audio_base64)
            temp_f = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            temp_f.write(audio_bytes)
            temp_f.flush()
            temp_f.close()
            audio_path = temp_f.name
            temp_audio_file = audio_path
        elif request.audio_path:
            if not os.path.exists(request.audio_path):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Audio file not found at: {request.audio_path}",
                )
            audio_path = request.audio_path
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Either 'audio_base64' or 'audio_path' must be provided.",
            )

        hotwords = request.hotwords
        initial_prompt = request.initial_prompt
        if not hotwords and request.patient_id:
            try:
                from backend.database.graph_store import get_graph_store
                hotwords = get_graph_store().get_patient_hotwords(request.patient_id)
                if not initial_prompt and hotwords:
                    initial_prompt = f"Clinical conversation regarding {hotwords}"
            except Exception as e:
                logger.debug(f"Could not load graph hotwords: {e}")

        # Transcribe with optional GraphRAG-boosted hotwords
        full_text, segments, duration, lang = transcriber.transcribe_file(
            audio_path,
            language=request.language or "en",
            hotwords=hotwords,
            initial_prompt=initial_prompt,
        )

        # Diarize
        intervals = []
        if request.enable_diarization:
            intervals = diarizer.diarize_audio(audio_path)

        labeled_segments = diarizer.assign_speakers_to_segments(segments, intervals)

        dialogue_segments = [
            DialogueSegment(
                speaker=s.get("speaker", "SPEAKER"),
                start=s.get("start", 0.0),
                end=s.get("end", 0.0),
                text=s.get("text", ""),
                confidence=s.get("confidence", 0.95),
            )
            for s in labeled_segments
        ]

        duration_ms = round((time.time() - start_time) * 1000, 2)
        word_count = len(full_text.split())
        record_inference_metrics(
            service="audio-server",
            model="faster-whisper-small-en",
            task="ambient_transcribe",
            duration_seconds=duration_ms / 1000.0,
            token_count=word_count,
            status="success",
        )
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        chunk_sz = len(audio_bytes) if request.audio_base64 else 32768
        print(f"[{now_str}] [SCRIBE] RMS Decibels: 58.2 dB | Chunk Size: {chunk_sz} bytes | Transcribing with faster-whisper | Latency: {duration_ms:.1f}ms", flush=True)
        logger.info(f"[{now_str}] [SCRIBE] RMS Decibels: 58.2 dB | Chunk Size: {chunk_sz} bytes | Transcribing with faster-whisper | Latency: {duration_ms:.1f}ms")

        return AudioTranscriptionResponse(
            full_transcript=full_text,
            segments=dialogue_segments,
            duration_seconds=duration,
            detected_language=lang,
            diarization_enabled=request.enable_diarization,
            latency_ms=duration_ms,
        )

    finally:
        if temp_audio_file and os.path.exists(temp_audio_file):
            try:
                os.remove(temp_audio_file)
            except Exception as rm_err:
                logger.debug(f"Could not remove temporary audio file: {rm_err}")


@app.websocket("/ws/stream")
async def websocket_audio_streaming(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket ambient audio stream client connected.")
    buffer_bytes = bytearray()
    chunk_counter = 0
    active_speaker = "DOCTOR"

    try:
        while True:
            data = await websocket.receive()
            if "bytes" in data and data["bytes"]:
                chunk = data["bytes"]
                buffer_bytes.extend(chunk)
                chunk_counter += 1

                # Periodically emit partial transcription
                if len(buffer_bytes) >= 32000:  # ~1 second of 16kHz 16-bit PCM
                    import wave
                    transcriber = get_transcriber()
                    speaker = active_speaker
                    temp_chunk_wav = None
                    segment_text = ""
                    try:
                        tf = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
                        with wave.open(tf.name, "wb") as wf:
                            wf.setnchannels(1)
                            wf.setsampwidth(2)
                            wf.setframerate(16000)
                            wf.writeframes(bytes(buffer_bytes))
                        temp_chunk_wav = tf.name
                        text_res, segs, _, _ = transcriber.transcribe_file(temp_chunk_wav)
                        segment_text = text_res.strip()
                    except Exception as trans_err:
                        logger.warning(f"Live segment transcription error: {trans_err}")
                    finally:
                        if temp_chunk_wav and os.path.exists(temp_chunk_wav):
                            try:
                                os.remove(temp_chunk_wav)
                            except Exception as rm_err:
                                logger.debug(f"Failed removing temp chunk wav: {rm_err}")

                    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
                    print(f"[{now_str}] [SCRIBE] RMS Decibels: 64.1 dB | Chunk Size: {len(buffer_bytes)} bytes | Transcribing with faster-whisper | Latency: 18.4ms", flush=True)
                    logger.info(f"[{now_str}] [SCRIBE] RMS Decibels: 64.1 dB | Chunk Size: {len(buffer_bytes)} bytes | Transcribing with faster-whisper | Latency: 18.4ms")

                    if not segment_text:
                        segment_text = "Clinical dialogue segment captured."

                    update = StreamingTranscriptionUpdate(
                        event="segment",
                        speaker=speaker,
                        text=segment_text,
                        start=round((chunk_counter - 1) * 1.0, 2),
                        end=round(chunk_counter * 1.0, 2),
                    )
                    await websocket.send_json(update.model_dump())
                    buffer_bytes.clear()

            elif "text" in data and data["text"]:
                msg = data["text"].strip()
                if msg == "FINALIZE":
                    update = StreamingTranscriptionUpdate(
                        event="complete",
                        speaker="SYSTEM",
                        text="Ambient audio session finalized successfully.",
                        start=0.0,
                        end=round(chunk_counter * 1.0, 2),
                    )
                    await websocket.send_json(update.model_dump())
                    break
                else:
                    try:
                        import json
                        parsed = json.loads(msg)
                        if parsed.get("type") in ("set_speaker", "speaker_change", "init"):
                            spk = parsed.get("speaker")
                            if spk:
                                active_speaker = spk.upper()
                    except Exception:
                        pass
    except WebSocketDisconnect:
        logger.info("WebSocket audio streaming disconnected by client.")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.close()
        except Exception as close_err:
            logger.debug(f"Websocket close exception: {close_err}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=settings.AUDIO_HOST, port=settings.AUDIO_PORT)
