/**
 * ClinixVault Automated Dual-Node Failover Agent
 *
 * Continuously monitors backend tunnel health and executes automated, seamless
 * failover between Google Colab GPU cloud tunnel and sovereign Local Edge inference.
 *
 * Rules:
 * - If Colab GPU latency exceeds 1,200ms or drops 3 consecutive heartbeats:
 *   -> Failover to Local Edge Node (http://127.0.0.1:8000)
 *   -> Reconfigure active model to local edge quantized models
 *   -> Trigger visual toast and dispatch failover event
 * - If both nodes are unreachable:
 *   -> Transition to 'offline' state (visual indicator: rose)
 * - Header connection pill status:
 *   amber = Colab GPU, emerald = Local Node, rose = Offline
 */

import { getApiBaseUrl, setApiBaseUrl } from './api';

export type NodeTarget = 'colab' | 'local';
export type NodeStatus = 'colab' | 'local' | 'offline';

export interface HeartbeatLog {
  timestamp: number;
  node: NodeTarget;
  url: string;
  latencyMs: number;
  status: 'optimal' | 'degraded' | 'failed';
  error?: string;
}

export interface FailoverState {
  activeNode: NodeStatus;
  currentUrl: string;
  colabUrl: string;
  localUrl: string;
  isAutoFailoverEnabled: boolean;
  consecutiveFailures: number;
  latencyMs: number;
  lastHeartbeatAt: number;
  colabHealthy: boolean;
  localHealthy: boolean;
  recentHeartbeats: HeartbeatLog[];
  lastFailoverReason?: string;
  lastFailoverAt?: number;
}

const DEFAULT_COLAB_URL = 'https://barry-cake-sugar-elizabeth.trycloudflare.com';
const DEFAULT_LOCAL_URL = 'http://127.0.0.1:8000';
const LATENCY_FAILOVER_THRESHOLD_MS = 1200;
const CONSECUTIVE_FAILURE_THRESHOLD = 3;
const HEARTBEAT_INTERVAL_MS = 2500;
const PROBE_TIMEOUT_MS = 3500;


class NodeFailoverAgent {
  private colabUrl: string = DEFAULT_COLAB_URL;
  private localUrl: string = DEFAULT_LOCAL_URL;
  private isAutoFailoverEnabled: boolean = true;
  private activeNode: NodeStatus = 'colab';
  private consecutiveFailures: number = 0;
  private highLatencyCount: number = 0;
  private currentLatencyMs: number = 0;
  private lastHeartbeatAt: number = 0;
  private colabHealthy: boolean = true;
  private localHealthy: boolean = true;
  private recentHeartbeats: HeartbeatLog[] = [];
  private lastFailoverReason?: string;
  private lastFailoverAt?: number;

  private timerId: any = null;
  private backgroundColabProbeTimer: any = null;
  private listeners: Set<(state: FailoverState) => void> = new Set();

  constructor() {
    this.loadPersistedConfig();
    this.detectInitialNode();
  }

  private loadPersistedConfig(): void {
    if (typeof window === 'undefined') return;

    const savedColab = localStorage.getItem('clinixvault_colab_url');
    if (savedColab && savedColab.trim()) {
      // Purge obsolete domain
      if (!savedColab.includes('consistent-testimonials')) {
        this.colabUrl = savedColab.trim().replace(/\/+$/, '');
      }
    }

    const savedLocal = localStorage.getItem('clinixvault_local_url');
    if (savedLocal && savedLocal.trim()) {
      this.localUrl = savedLocal.trim().replace(/\/+$/, '');
    }

    const autoFailover = localStorage.getItem('clinixvault_auto_failover');
    if (autoFailover !== null) {
      this.isAutoFailoverEnabled = autoFailover === 'true';
    }
  }

  private detectInitialNode(): void {
    const current = getApiBaseUrl();
    if (current.includes('127.0.0.1') || current.includes('localhost')) {
      this.activeNode = 'local';
    } else {
      this.activeNode = 'colab';
      this.colabUrl = current;
    }
  }

  public getState(): FailoverState {
    return {
      activeNode: this.activeNode,
      currentUrl: getApiBaseUrl(),
      colabUrl: this.colabUrl,
      localUrl: this.localUrl,
      isAutoFailoverEnabled: this.isAutoFailoverEnabled,
      consecutiveFailures: this.consecutiveFailures,
      latencyMs: this.currentLatencyMs,
      lastHeartbeatAt: this.lastHeartbeatAt,
      colabHealthy: this.colabHealthy,
      localHealthy: this.localHealthy,
      recentHeartbeats: [...this.recentHeartbeats],
      lastFailoverReason: this.lastFailoverReason,
      lastFailoverAt: this.lastFailoverAt,
    };
  }

  public subscribe(cb: (state: FailoverState) => void): () => void {
    this.listeners.add(cb);
    cb(this.getState());
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify(): void {
    const state = this.getState();
    this.listeners.forEach((cb) => {
      try {
        cb(state);
      } catch (e) {
        console.error('Error in failover state listener:', e);
      }
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('clinixvault:node_status_changed', { detail: state })
      );
    }
  }

  public setColabUrl(url: string): void {
    const clean = (url || '').trim().replace(/\/+$/, '');
    if (!clean) return;
    this.colabUrl = clean;
    if (typeof window !== 'undefined') {
      localStorage.setItem('clinixvault_colab_url', clean);
    }
    if (this.activeNode === 'colab') {
      setApiBaseUrl(clean);
    }
    this.notify();
    void this.triggerHeartbeat();
  }

  public setLocalUrl(url: string): void {
    const clean = (url || '').trim().replace(/\/+$/, '');
    if (!clean) return;
    this.localUrl = clean;
    if (typeof window !== 'undefined') {
      localStorage.setItem('clinixvault_local_url', clean);
    }
    if (this.activeNode === 'local') {
      setApiBaseUrl(clean);
    }
    this.notify();
    void this.triggerHeartbeat();
  }

  public setAutoFailoverEnabled(enabled: boolean): void {
    this.isAutoFailoverEnabled = enabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem('clinixvault_auto_failover', String(enabled));
    }
    this.notify();
  }

  /**
   * Probe an endpoint with a strict abort timeout.
   */
  private async probeEndpoint(
    url: string
  ): Promise<{ ok: boolean; latencyMs: number; error?: string; isTimeout?: boolean }> {
    const t0 = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    try {
      const resp = await fetch(`${url}/api/v1/health`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer vault-local-admin-token',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const latencyMs = Math.round(performance.now() - t0);
      return { ok: resp.ok, latencyMs };
    } catch (err: any) {
      clearTimeout(timeout);
      const latencyMs = Math.round(performance.now() - t0);
      const isTimeout = err?.name === 'AbortError' || err?.message?.includes('aborted');
      const msg = isTimeout ? `Heartbeat timed out (>${PROBE_TIMEOUT_MS}ms)` : (err?.message || 'Network error');
      return { ok: false, latencyMs, error: msg, isTimeout };
    }
  }

  /**
   * Execute single heartbeat cycle.
   */
  public async triggerHeartbeat(): Promise<void> {
    const activeUrl = getApiBaseUrl();
    const isColabActive = activeUrl === this.colabUrl;
    const targetNode: NodeTarget = isColabActive ? 'colab' : 'local';

    const result = await this.probeEndpoint(activeUrl);
    this.lastHeartbeatAt = Date.now();
    this.currentLatencyMs = result.latencyMs;

    const log: HeartbeatLog = {
      timestamp: this.lastHeartbeatAt,
      node: targetNode,
      url: activeUrl,
      latencyMs: result.latencyMs,
      status: result.ok
        ? result.latencyMs > LATENCY_FAILOVER_THRESHOLD_MS
          ? 'degraded'
          : 'optimal'
        : 'failed',
      error: result.error,
    };

    this.recentHeartbeats = [log, ...this.recentHeartbeats.slice(0, 19)];

    if (result.ok) {
      const wasOffline = this.activeNode === 'offline';
      if (isColabActive) {
        this.colabHealthy = true;
      } else {
        this.localHealthy = true;
      }
      this.consecutiveFailures = 0;

      // Track latency threshold
      if (result.latencyMs > LATENCY_FAILOVER_THRESHOLD_MS && isColabActive) {
        this.highLatencyCount += 1;
      } else {
        this.highLatencyCount = 0;
      }

      this.activeNode = isColabActive ? 'colab' : 'local';

      if (wasOffline && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('clinixvault:backend_recovered', {
            detail: { node: this.activeNode, url: activeUrl, latencyMs: result.latencyMs },
          })
        );
      }
    } else {
      if (isColabActive) {
        this.colabHealthy = false;
      } else {
        this.localHealthy = false;
      }
      this.consecutiveFailures += 1;
    }

    // Failover evaluation
    if (this.isAutoFailoverEnabled && isColabActive) {
      const shouldFailover =
        this.consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD ||
        this.highLatencyCount >= 1;

      if (shouldFailover) {
        const reason =
          this.consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD
            ? `Dropped ${this.consecutiveFailures} consecutive heartbeats`
            : `Latency exceeded ${LATENCY_FAILOVER_THRESHOLD_MS}ms (${this.currentLatencyMs}ms)`;

        await this.executeFailoverToLocal(reason);
        return;
      }
    }

    // If active node is completely offline
    const failureThreshold = (result.isTimeout && !isColabActive) ? 4 : CONSECUTIVE_FAILURE_THRESHOLD;
    if (!result.ok && this.consecutiveFailures >= failureThreshold) {
      // Check if secondary node is alive
      const altUrl = isColabActive ? this.localUrl : this.colabUrl;
      const altResult = await this.probeEndpoint(altUrl);

      if (altResult.ok && this.isAutoFailoverEnabled) {
        if (isColabActive) {
          await this.executeFailoverToLocal('Colab tunnel unreachable; switched to Local Node');
          return;
        } else {
          await this.switchToColab('Local node down; switched to Colab GPU');
          return;
        }
      } else if (!altResult.ok) {
        this.activeNode = 'offline';
      }
    }

    this.notify();
  }

  /**
   * Execute failover from Colab to Local Edge.
   */
  public async executeFailoverToLocal(reason: string): Promise<void> {
    console.warn(`[FailoverAgent] ⚡ Executing seamless failover to Local Node: ${reason}`);
    this.lastFailoverReason = reason;
    this.lastFailoverAt = Date.now();
    this.activeNode = 'local';
    this.consecutiveFailures = 0;
    this.highLatencyCount = 0;

    // Apply URL
    setApiBaseUrl(this.localUrl);

    // Switch inference model to local quantized edge model
    try {
      await fetch(`${this.localUrl}/api/v1/models/active`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer vault-local-admin-token',
        },
        body: JSON.stringify({
          radiology_model: 'smolvlm-qlora',
          summarize_model: 'qwen2.5-coder:1.5b',
        }),
      });
    } catch {}

    this.notify();

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('clinixvault:failover_event', {
          detail: {
            from: 'colab',
            to: 'local',
            reason,
            url: this.localUrl,
            timestamp: Date.now(),
          },
        })
      );
      window.dispatchEvent(
        new CustomEvent('clinixvault:node_failover', {
          detail: {
            from: 'colab',
            to: 'local',
            reason,
            url: this.localUrl,
            timestamp: Date.now(),
          },
        })
      );
    }
  }

  /**
   * Switch active node to Colab GPU.
   */
  public async switchToColab(reason?: string, targetUrl?: string): Promise<void> {
    if (targetUrl) {
      const clean = targetUrl.trim().replace(/\/+$/, '');
      if (clean) this.colabUrl = clean;
    }
    this.activeNode = 'colab';
    this.consecutiveFailures = 0;
    this.highLatencyCount = 0;
    this.lastFailoverReason = reason;
    this.lastFailoverAt = Date.now();

    setApiBaseUrl(this.colabUrl);
    this.notify();

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('clinixvault:failover_event', {
          detail: {
            from: 'local',
            to: 'colab',
            reason: reason || 'Manual node switch to Colab GPU',
            url: this.colabUrl,
            timestamp: Date.now(),
          },
        })
      );
      window.dispatchEvent(
        new CustomEvent('clinixvault:node_failover', {
          detail: {
            from: 'local',
            to: 'colab',
            reason: reason || 'Manual node switch to Colab GPU',
            url: this.colabUrl,
            timestamp: Date.now(),
          },
        })
      );
    }
  }

  /**
   * Background probe checking if Colab has recovered while running on Local Node.
   */
  private async probeColabRecovery(): Promise<void> {
    if (this.activeNode !== 'local') return;

    const probe = await this.probeEndpoint(this.colabUrl);
    if (probe.ok && probe.latencyMs < 1000) {
      this.colabHealthy = true;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('clinixvault:colab_recovered', {
            detail: { latencyMs: probe.latencyMs, url: this.colabUrl },
          })
        );
      }
    } else {
      this.colabHealthy = false;
    }
    this.notify();
  }

  /**
   * Start the continuous failover heartbeat loops.
   */
  public start(): () => void {
    if (this.timerId) return () => this.stop();

    void this.triggerHeartbeat();

    this.timerId = setInterval(() => {
      void this.triggerHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    this.backgroundColabProbeTimer = setInterval(() => {
      void this.probeColabRecovery();
    }, 8000);

    return () => this.stop();
  }

  public stop(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.backgroundColabProbeTimer) {
      clearInterval(this.backgroundColabProbeTimer);
      this.backgroundColabProbeTimer = null;
    }
  }
}

export const failoverAgent = new NodeFailoverAgent();
