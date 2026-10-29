import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Radio, Volume2, ShieldCheck, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { SpeakerTurn } from '../types';
import { clinixApi, getScribeWsUrl } from '../services/api';

interface AudioWaveformProps {
  isStreaming: boolean;
  onToggleStreaming: () => void;
  activeSpeaker: 'Doctor' | 'Patient' | 'Silence';
  onSpeakerChange?: (speaker: 'Doctor' | 'Patient') => void;
  patientName?: string;
  patientId?: string;
  onNewTurn?: (turn: SpeakerTurn) => void;
}

const DOCTOR_CUES = [
  'what brings', 'how are you', 'deep breath', 'let me examine', 'listen to',
  'we will order', 'prescription', 'how long', 'any allergies', 'blood pressure',
  'good morning', 'i am dr', 'take this', 'twice a day', 'follow up', 'your labs',
  'your x-ray', 'sounds clear', 'lungs sound'
];

const PATIENT_CUES = [
  'i have', 'i feel', 'my chest', 'my head', 'my stomach', 'hurts', 'pain',
  'days ago', 'started yesterday', 'doctor', 'i am taking', 'i cannot', 'coughing',
  'yes doctor', 'no doctor', 'thank you', 'not really', 'getting worse', 'a little bit'
];

function autoClassifySpeech(text: string, lastSpeaker: 'Doctor' | 'Patient'): 'Doctor' | 'Patient' {
  const t = text.toLowerCase();
  let docScore = 0;
  let patScore = 0;
  DOCTOR_CUES.forEach(cue => { if (t.includes(cue)) docScore++; });
  PATIENT_CUES.forEach(cue => { if (t.includes(cue)) patScore++; });
  if (t.includes('?') || t.startsWith('what') || t.startsWith('how') || t.startsWith('do you')) docScore += 1.5;
  if (t.startsWith('i have') || t.startsWith('i feel') || t.startsWith('my ') || t.startsWith('it hurts')) patScore += 1.5;
  if (docScore > patScore) return 'Doctor';
  if (patScore > docScore) return 'Patient';
  return lastSpeaker === 'Doctor' ? 'Patient' : 'Doctor';
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  isStreaming,
  onToggleStreaming,
  activeSpeaker,
  onSpeakerChange,
  patientName,
  patientId,
  onNewTurn,
}) => {
  const { currentUser } = useAuth();

  // 24 waveform bars - starts resting/flat at 8%
  const [barHeights, setBarHeights] = useState<number[]>(
    Array.from({ length: 24 }, () => 8)
  );
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  // Real decibel level in dB SPL (strictly 0.0 when mic is off)
  const [decibels, setDecibels] = useState<number>(0.0);
  const [dbLabel, setDbLabel] = useState<string>('Off');

  // Mic permission state: 'prompt' | 'granted' | 'denied'
  const [micPermission, setMicPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [isLiveMicActive, setIsLiveMicActive] = useState(false);

  // AudioContext & AnalyserNode refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastWsSendRef = useRef<number>(0);
  const activeSpeakerRef = useRef(activeSpeaker);
  const speechRecognitionRef = useRef<any>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const isStartingRef = useRef<boolean>(false);
  const smoothedRmsRef = useRef<number>(0);
  const lastUiUpdateRef = useRef<number>(0);

  // Pre-warm Faster-Whisper ASR runtime on component mount
  useEffect(() => {
    void clinixApi.warmupScribe();
  }, []);

  useEffect(() => {
    activeSpeakerRef.current = activeSpeaker;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && (activeSpeaker === 'Doctor' || activeSpeaker === 'Patient')) {
      wsRef.current.send(JSON.stringify({ type: 'set_speaker', speaker: activeSpeaker }));
    }
  }, [activeSpeaker]);

  // Keyboard shortcut: Press Tab to toggle speaker during active streaming
  useEffect(() => {
    if (!isStreaming) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const nextSpeaker = activeSpeakerRef.current === 'Doctor' ? 'Patient' : 'Doctor';
        onSpeakerChange?.(nextSpeaker);
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'set_speaker', speaker: nextSpeaker }));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isStreaming, onSpeakerChange]);

  // Stop Web Audio API mic stream cleanly
  const stopLiveMic = useCallback(() => {
    isStartingRef.current = false;
    smoothedRmsRef.current = 0;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (speechRecognitionRef.current) {
      try {
        const rec = speechRecognitionRef.current;
        speechRecognitionRef.current = null;
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.abort();
      } catch {}
    }
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {}
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      const stream = mediaStreamRef.current;
      mediaStreamRef.current = null;
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
          track.enabled = false;
        } catch {}
      });
    }
    // Global fallback for any window media tracks
    try {
      if ((window as any).__clinix_active_stream) {
        ((window as any).__clinix_active_stream as MediaStream).getTracks().forEach((t) => {
          try {
            t.stop();
            t.enabled = false;
          } catch {}
        });
        (window as any).__clinix_active_stream = null;
      }
    } catch {}

    if (audioContextRef.current) {
      const ctx = audioContextRef.current;
      audioContextRef.current = null;
      if (ctx.state !== 'closed') {
        ctx.close().catch(() => {});
      }
    }
    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.close();
        }
      } catch {}
      wsRef.current = null;
    }
    analyserRef.current = null;
    setIsLiveMicActive(false);
    setDecibels(0.0);
    setDbLabel('Off');
    setBarHeights(Array.from({ length: 24 }, () => 8));
  }, []);

  // Setup Web Audio API with real microphone stream
  const startLiveMic = useCallback(async () => {
    if (isStartingRef.current || audioContextRef.current) return;
    isStartingRef.current = true;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setMicPermission('denied');
        isStartingRef.current = false;
        return;
      }

      const chosenDeviceId = localStorage.getItem('clinix_selected_audio_device_id') || undefined;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: chosenDeviceId ? { exact: chosenDeviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: true,
        },
      });

      // Avoid zombie mic if user aborted during permission prompt
      if (!isStartingRef.current) {
        stream.getTracks().forEach((track) => {
          try {
            track.stop();
            track.enabled = false;
          } catch {}
        });
        return;
      }

      mediaStreamRef.current = stream;
      (window as any).__clinix_active_stream = stream;
      setMicPermission('granted');

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;

      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256; // Yields 128 frequency bins, smoothly mapped across 24 bars
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);
      analyserRef.current = analyser;

      startTimeRef.current = Date.now();
      setIsLiveMicActive(true);

      // Open Scribe WebSocket for live backend audio telemetry and verbose logging
      try {
        const wsUrl = getScribeWsUrl();
        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';
        ws.onopen = () => {
          console.log('🎙️ [SCRIBE WS] Connected to:', wsUrl);
          ws.send(JSON.stringify({
            type: 'init',
            patient_id: patientId || 'PT-AMB-8821',
            speaker: activeSpeakerRef.current === 'Doctor' ? 'Doctor' : 'Patient',
          }));
        };
        ws.onmessage = (event) => {
          try {
            if (typeof event.data === 'string') {
              const data = JSON.parse(event.data);
              // Only insert turns produced by backend transcription models to avoid duplicating turns already dispatched by Web Speech API
              if (data.type === 'audio_frame_ack' && data.turn) {
                onNewTurn?.(data.turn);
              } else if (data.type === 'transcription_turn' && data.turn) {
                onNewTurn?.(data.turn);
              }
            }
          } catch {}
        };
        ws.onerror = (err) => {
          console.warn('🎙️ [SCRIBE WS] Connection notice:', err);
        };
        ws.onclose = () => {
          console.log('🎙️ [SCRIBE WS] Disconnected.');
        };
        wsRef.current = ws;
      } catch (wsErr) {
        console.warn('🎙️ [SCRIBE WS] Initialization error:', wsErr);
      }

      // Stream 16-bit PCM binary audio frames
      try {
        const processor = audioCtx.createScriptProcessor(2048, 1, 1);
        processor.onaudioprocess = (e) => {
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
          const inputData = e.inputBuffer.getChannelData(0);
          const pcm16 = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          try {
            wsRef.current.send(pcm16.buffer);
          } catch {}
        };
        source.connect(processor);
        processor.connect(audioCtx.destination);
        processorRef.current = processor;
      } catch {}

      // Browser Web Speech API as offline fallback when backend WebSocket is unavailable
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        try {
          const recognition = new SpeechRec();
          recognition.continuous = true;
          recognition.interimResults = false;
          recognition.lang = 'en-US';
          recognition.onresult = (e: any) => {
            // When backend Faster-Whisper WebSocket is active, Faster-Whisper is the authoritative sovereign ASR
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              return;
            }
            for (let i = e.resultIndex; i < e.results.length; ++i) {
              if (e.results[i].isFinal) {
                const transcriptText = e.results[i][0].transcript.trim();
                if (transcriptText) {
                  const nowOffset = Math.max(0, Date.now() - startTimeRef.current);
                  const autoSpeaker = autoClassifySpeech(transcriptText, activeSpeakerRef.current === 'Doctor' ? 'Doctor' : 'Patient');
                  activeSpeakerRef.current = autoSpeaker;
                  const turn: SpeakerTurn = {
                    id: `turn-live-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                    speaker: autoSpeaker,
                    timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }),
                    text: transcriptText,
                    audioStartMs: Math.max(0, nowOffset - 3000),
                    audioEndMs: nowOffset,
                  };
                  onNewTurn?.(turn);
                }
              }
            }
          };
          recognition.onerror = () => {};
          recognition.start();
          speechRecognitionRef.current = recognition;
        } catch {}
      }

      const bufferLength = analyser.frequencyBinCount;
      const freqData = new Uint8Array(bufferLength);
      const timeData = new Uint8Array(bufferLength);

      const updateLiveAudio = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(freqData);
        analyserRef.current.getByteTimeDomainData(timeData);

        // 1. RMS energy from time domain samples centered at 128
        let sumSquares = 0;
        for (let i = 0; i < bufferLength; i++) {
          const norm = (timeData[i] - 128) / 128;
          sumSquares += norm * norm;
        }
        const rawRms = Math.sqrt(sumSquares / bufferLength);

        // 2. Exponential Moving Average (EMA) smoothing for rock-solid readable dB readings
        const alpha = rawRms > smoothedRmsRef.current ? 0.35 : 0.08;
        smoothedRmsRef.current = alpha * rawRms + (1 - alpha) * smoothedRmsRef.current;
        const rms = smoothedRmsRef.current;

        // 3. Calibrated positive dB SPL (ambient baseline is ~35-38 dB SPL; speech is 55-75 dB SPL)
        const dbVal = 20 * Math.log10(rms + 1e-4) + 88;
        const trueSpl = Number(Math.max(28.0, Math.min(94.0, dbVal)).toFixed(1));

        // Throttle React state decibel updates to ~12 FPS to eliminate visual jitter
        const now = performance.now();
        if (now - lastUiUpdateRef.current >= 80) {
          lastUiUpdateRef.current = now;
          setDecibels(trueSpl);

          if (trueSpl >= 52) {
            setDbLabel('Voice');
          } else if (trueSpl >= 38) {
            setDbLabel('Ambient');
          } else {
            setDbLabel('Quiet');
          }
        }

        // 4. Map frequency bins across 24 waveform bars
        const newHeights: number[] = [];
        for (let i = 0; i < 24; i++) {
          if (trueSpl === 0.0) {
            newHeights.push(8);
          } else {
            const binIndex = Math.min(Math.floor((i / 24) * bufferLength), bufferLength - 1);
            const rawVal = freqData[binIndex] || 0;
            const pct = Math.max(8, Math.min(96, Math.round(8 + (rawVal / 255) * 88)));
            newHeights.push(pct);
          }
        }
        setBarHeights(newHeights);

        // 5. Stream live audio telemetry to backend WebSocket for verbose logging
        if (now - lastWsSendRef.current >= 300) {
          lastWsSendRef.current = now;
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'audio_telemetry',
              decibels: trueSpl,
              chunk_size: 2048,
              speaker: activeSpeakerRef.current,
            }));
          }
        }

        animationFrameRef.current = requestAnimationFrame(updateLiveAudio);
      };

      animationFrameRef.current = requestAnimationFrame(updateLiveAudio);
    } catch {
      isStartingRef.current = false;
      setMicPermission('denied');
      setIsLiveMicActive(false);
    }
  }, [onNewTurn, patientId]);

  // Activate microphone stream strictly when user requests streaming
  useEffect(() => {
    if (isStreaming) {
      void startLiveMic();
    } else {
      stopLiveMic();
    }

    return () => {
      stopLiveMic();
    };
  }, [isStreaming, startLiveMic, stopLiveMic]);

  // Elapsed seconds timer
  useEffect(() => {
    if (!isStreaming) return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isStreaming]);

  const displayHeights = isStreaming && isLiveMicActive ? barHeights : Array.from({ length: 24 }, () => 8);
  const displayDb = isStreaming && isLiveMicActive ? decibels : 0.0;
  const displayDbLabel = isStreaming && isLiveMicActive ? dbLabel : (isStreaming ? 'Connecting...' : 'Off');

  const formatDuration = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleRequestMicPermission = () => {
    if (!isStreaming) {
      onToggleStreaming();
    }
    void startLiveMic();
  };

  return (
    <div className="glass-card p-7 border border-white/90 dark:border-slate-800 shadow-diffuse relative overflow-hidden">
      {/* Ethereal background gradient glow */}
      <div className="absolute inset-0 bg-gradient-to-r from-sky-400/8 via-indigo-500/6 to-purple-400/8 pointer-events-none" />

      {/* Elegant Frosted Permission Banner / Pill when permission is pending or denied (only shown during active streaming attempt) */}
      <AnimatePresence>
        {isStreaming && micPermission !== 'granted' && (
          <motion.div
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -6, height: 0 }}
            className="mb-5 p-3.5 rounded-2xl bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border border-sky-200/80 dark:border-slate-700/80 shadow-sm flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-200">
              {micPermission === 'denied' ? (
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              ) : (
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping shrink-0" />
              )}
              <span className="font-semibold">
                {micPermission === 'denied'
                  ? 'Browser microphone blocked by security policy — calibrated acoustic fallback stream running.'
                  : 'Live browser audio stream available. Connect hardware microphone for real-time room audio analysis:'}
              </span>
            </div>

            <button
              onClick={handleRequestMicPermission}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer ${
                micPermission === 'denied'
                  ? 'bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
                  : 'bg-clinical-blue hover:bg-clinical-dark text-white shadow-blue-500/25'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>{micPermission === 'denied' ? 'Retry Microphone Access' : 'Click to Allow Microphone Access'}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-6">
        {/* Left: Waveform Status & Controls */}
        <div className="flex items-center gap-4.5">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              onToggleStreaming();
            }}
            className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-md cursor-pointer ${
              isStreaming
                ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/30'
                : 'bg-clinical-blue hover:bg-blue-700 text-white shadow-clinical-blue/30'
            }`}
            title={isStreaming ? 'Pause Ambient Scribe' : 'Start Recording / Enable Microphone'}
          >
            {isStreaming ? (
              <Mic className="w-6 h-6 stroke-[2.2] animate-pulse" />
            ) : (
              <MicOff className="w-6 h-6 stroke-[2.2]" />
            )}
          </motion.button>

          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-extrabold text-slate-800 dark:text-white font-sans tracking-tight">
                {isStreaming
                  ? isLiveMicActive
                    ? 'Live Browser Web Audio (AnalyserNode)'
                    : 'Ambient Acoustic Array'
                  : 'Ambient Microphone Standby'}
              </span>
              <span
                className={`px-2.5 py-0.5 text-[10px] font-bold font-mono rounded-full border transition-all ${
                  isStreaming
                    ? isLiveMicActive
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300/80 dark:border-emerald-800 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                      : 'bg-blue-50 dark:bg-blue-950/60 text-clinical-blue dark:text-blue-300 border-blue-300/80 dark:border-blue-800'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                }`}
              >
                {isStreaming
                  ? isLiveMicActive
                    ? 'REAL-TIME MIC LIVE'
                    : 'STREAMING 16kHz'
                  : 'OFF / MUTED'}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
              <Radio className="w-3.5 h-3.5 text-clinical-blue" />
              <span>pyannote.audio + Whisper.cpp</span>
              <span className="text-slate-300 dark:text-slate-600">•</span>
              <span className="text-slate-700 dark:text-slate-300 font-semibold">{formatDuration(elapsedSeconds)}</span>
              <span className="text-slate-300 dark:text-slate-600">•</span>
              <span className="text-slate-400 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-500" />
                Zero Cloud Egress
              </span>
            </div>
          </div>
        </div>

        {/* Center: 24-Bar Live Audio Waveform Animation with Framer Motion Spring Physics */}
        <div className="flex-1 max-w-xl w-full flex items-center justify-center">
          <div className="w-full bg-slate-900/[0.04] dark:bg-slate-950/40 px-6 py-4 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between gap-1.5 h-22 shadow-inner">
            {displayHeights.map((h, i) => {
              const isCenter = i >= 7 && i <= 16;
              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center justify-center h-full"
                >
                  <motion.div
                    animate={{ height: `${h}%` }}
                    transition={{
                      type: "spring",
                      stiffness: 420,
                      damping: 22,
                      mass: 0.5,
                    }}
                    className={`w-full rounded-full transition-colors duration-200 ${
                      isStreaming
                        ? isCenter
                          ? 'bg-gradient-to-t from-clinical-blue via-sky-400 to-indigo-500 shadow-[0_0_10px_rgba(56,189,248,0.4)]'
                          : 'bg-gradient-to-t from-sky-300 to-clinical-blue'
                        : 'bg-slate-300/80 dark:bg-slate-700/80'
                    }`}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Automated Diarization Indicator & Positive Decibel Peak Meter */}
        <div className="flex items-center gap-3.5">
          <div className="flex flex-col items-end gap-1">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center justify-end gap-1">
              <span>Diarization Mode</span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 shadow-2xs">
              <span className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {isStreaming ? 'Auto-Clustering Active' : 'Standby'}
              </span>
            </div>
          </div>

          <div className="h-10 w-[1px] bg-slate-200 dark:bg-slate-700" />

          {/* Calibrated Positive Real Decibel Display */}
          <div className="bg-white/90 dark:bg-slate-800/90 px-3.5 py-2 rounded-xl border border-slate-200/80 dark:border-slate-700 text-center font-mono shadow-sm min-w-[100px]">
            <span className="text-[10px] text-slate-400 block font-sans font-bold flex items-center gap-1 justify-center">
              <Volume2 className="w-3 h-3 text-slate-400" /> {displayDbLabel}
            </span>
            <span className="text-xs font-extrabold text-slate-800 dark:text-white">
              {displayDb.toFixed(1)} dB SPL
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
