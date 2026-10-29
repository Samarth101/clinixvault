/**
 * ClinixVault Ambient Medical Scribe WebSocket Client.
 * Connects to ws://127.0.0.1:8000/api/v1/scribe/stream.
 * Supports both live microphone recording (16kHz PCM) and simulated clinical dialogue streaming.
 */

import { SpeakerTurn } from '../types';
import { getScribeWsUrl } from './api';

export type ScribeClientState = 'idle' | 'connecting' | 'connected' | 'recording' | 'simulating' | 'synthesizing' | 'error';

export interface ScribeClientCallbacks {
  onStateChange?: (state: ScribeClientState) => void;
  onDecibels?: (db: number) => void;
  onSpeakerTurn?: (turn: SpeakerTurn) => void;
  onSoapSynthesized?: (payload: any) => void;
  onError?: (error: string) => void;
}

export class ScribeWebSocketClient {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private state: ScribeClientState = 'idle';
  private callbacks: ScribeClientCallbacks = {};
  private simulationInterval: any = null;
  private activePatientId = 'default-patient';
  private wsUrl: string;

  constructor(callbacks: ScribeClientCallbacks = {}, customWsUrl?: string) {
    this.callbacks = callbacks;
    this.wsUrl = customWsUrl || getScribeWsUrl();
  }

  public getState(): ScribeClientState {
    return this.state;
  }

  private setState(newState: ScribeClientState) {
    this.state = newState;
    if (this.callbacks.onStateChange) {
      this.callbacks.onStateChange(newState);
    }
  }

  /**
   * Connect to backend WebSocket and initialize session
   */
  public async connect(patientId = 'default-patient'): Promise<boolean> {
    this.activePatientId = patientId;
    this.setState('connecting');

    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(this.wsUrl);
        this.ws.binaryType = 'arraybuffer';

        const timeout = setTimeout(() => {
          if (this.state === 'connecting') {
            this.setState('error');
            if (this.callbacks.onError) {
              this.callbacks.onError('WebSocket connection timed out (backend offline).');
            }
            resolve(false);
          }
        }, 3000);

        this.ws.onopen = () => {
          clearTimeout(timeout);
          this.setState('connected');
          // Send init message
          this.ws?.send(JSON.stringify({ type: 'init', patient_id: this.activePatientId }));
          resolve(true);
        };

        this.ws.onmessage = (event) => {
          try {
            if (typeof event.data === 'string') {
              const data = JSON.parse(event.data);
              if (data.type === 'soap_synthesized') {
                this.setState('connected');
                if (this.callbacks.onSoapSynthesized) {
                  this.callbacks.onSoapSynthesized(data);
                }
              } else if (data.type === 'audio_frame_ack' || data.type === 'audio_telemetry_ack') {
                if (data.decibels && this.callbacks.onDecibels) {
                  this.callbacks.onDecibels(data.decibels);
                }
              }
            }
          } catch {
            // Non-JSON message
          }
        };

        this.ws.onerror = () => {
          clearTimeout(timeout);
          this.setState('error');
          if (this.callbacks.onError) {
            this.callbacks.onError('Gateway WebSocket connection failed.');
          }
          resolve(false);
        };

        this.ws.onclose = () => {
          if (this.state !== 'idle') {
            this.setState('idle');
          }
        };
      } catch (err: any) {
        this.setState('error');
        if (this.callbacks.onError) {
          this.callbacks.onError(err.message || 'WebSocket initialization error.');
        }
        resolve(false);
      }
    });
  }

  /**
   * Start live microphone recording using Web Audio API
   */
  public async startMicrophoneCapture(patientId = 'default-patient'): Promise<boolean> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      const connected = await this.connect(patientId);
      if (!connected) return false;
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      // Target 16kHz AudioContext
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Buffer size 2048 gives ~128ms chunks at 16kHz
      this.processor = this.audioContext.createScriptProcessor(2048, 1, 1);

      this.processor.onaudioprocess = (e) => {
        if (this.state !== 'recording') return;

        const inputData = e.inputBuffer.getChannelData(0);
        
        // Compute RMS decibels locally for zero-latency UI
        let sumSq = 0;
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          sumSq += s * s;
        }

        const rms = Math.sqrt(sumSq / inputData.length);
        const db = Math.min(88, Math.max(38, Math.round(20 * Math.log10(rms + 1e-4) * 1.5 + 75)));
        if (this.callbacks.onDecibels) {
          this.callbacks.onDecibels(db);
        }

        // Send binary PCM frame over WebSocket
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(pcm16.buffer);
        }
      };

      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      this.setState('recording');
      return true;
    } catch (err: any) {
      if (this.callbacks.onError) {
        this.callbacks.onError(`Microphone access error: ${err.message || 'Permission denied'}`);
      }
      return false;
    }
  }

  /**
   * Stop active audio capture
   */
  public stopAudioCapture() {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }

    if (this.processor) {
      try {
        this.processor.disconnect();
      } catch {}
      this.processor = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        track.stop();
        track.enabled = false;
      });
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    if (this.state === 'recording' || this.state === 'simulating') {
      this.setState('connected');
    }
  }

  /**
   * Finalize encounter session: triggers backend Whisper transcription, LLM SOAP synthesis, and cryptographic provenance
   */
  public finalizeSession() {
    this.stopAudioCapture();
    this.setState('synthesizing');

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'finalize' }));
    } else {
      this.setState('idle');
    }
  }

  /**
   * Disconnect completely
   */
  public disconnect() {
    this.stopAudioCapture();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setState('idle');
  }
}
