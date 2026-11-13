/**
 * ClinixVault Automated Multi-Provider Failover Agent
 *
 * Tiered GPU & Edge Architecture:
 * Priority 1: Google Colab GPU Cloud Tunnel (Tesla T4 15GB VRAM — user-provided via frontend)
 * Priority 2: Sovereign Local Edge Node (Apple Silicon MPS / Local Ollama / C++ SIMD)
 *
 * Failover Rules:
 * - Colab tunnel is dynamically provided via frontend (no hardcoded URLs).
 * - Priority order: Colab GPU (P1) -> Sovereign Local Edge Node (P2).
 * - If Colab drops 3 consecutive heartbeats or is unconfigured:
 *   -> Automatically promotes Priority 2 (Local Edge Node http://127.0.0.1:8000).
 * - Background Promotion:
 *   -> When running on Local Edge, continuously probes Colab in background.
 *   -> As soon as the clinician starts a Colab tunnel and pastes it, or an existing
 *      Colab tunnel recovers, automatically promotes back to Colab GPU!
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
  gpuPriority: NodeTarget[];
}

const DEFAULT_COLAB_URL = '';
const DEFAULT_LOCAL_URL = 'http://127.0.0.1:8000';

const LATENCY_FAILOVER_THRESHOLD_MS = 6000;
const CONSECUTIVE_FAILURE_THRESHOLD = 3;
const HEARTBEAT_INTERVAL_MS = 3000;
const PROBE_TIMEOUT_MS = 6500;

class NodeFailoverAgent {
  private colabUrl: string = DEFAULT_COLAB_URL;
  private localUrl: string = DEFAULT_LOCAL_URL;

  private isAutoFailoverEnabled: boolean = true;
  private activeNode: NodeStatus = 'local';
  private consecutiveFailures: number = 0;
  private highLatencyCount: number = 0;
  private currentLatencyMs: number = 0;
  private lastHeartbeatAt: number = 0;

  private colabHealthy: boolean = false;
  private localHealthy: boolean = false;

  private recentHeartbeats: HeartbeatLog[] = [];
  private lastFailoverReason?: string;
  private lastFailoverAt?: number;

  private timerId: any = null;
  private backgroundPromotionTimer: any = null;
  private listeners: Set<(state: FailoverState) => void> = new Set();

  constructor() {
    this.loadPersistedConfig();
    this.detectInitialNode();
  }

  private loadPersistedConfig(): void {
    if (typeof window === 'undefined') return;

    const savedColab = localStorage.getItem('clinixvault_colab_url');
    if (savedColab && savedColab.trim()) {
      this.colabUrl = savedColab.trim().replace(/\/+$/, '');
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
    if (current && (current.includes('trycloudflare.com') || (this.colabUrl && current === this.colabUrl))) {
      this.activeNode = 'colab';
      this.colabUrl = current;
    } else {
      this.activeNode = 'local';
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
      gpuPriority: ['colab', 'local'],
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
    this.colabUrl = clean;
    if (typeof window !== 'undefined') {
      if (clean) {
        localStorage.setItem('clinixvault_colab_url', clean);
      } else {
        localStorage.removeItem('clinixvault_colab_url');
      }
    }
    if (clean) {
      void this.switchToColab('Configured Colab GPU Cloud Tunnel', clean);
    }
    this.notify();
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

  public clearHeartbeatHistory(): void {
    this.recentHeartbeats = [];
    this.notify();
  }

  /**
   * Healthcheck probe for a given URL.
   */
  public async probeEndpoint(
    url: string,
    timeoutMs: number = PROBE_TIMEOUT_MS
  ): Promise<{ ok: boolean; latencyMs: number; error?: string; isTimeout?: boolean; data?: any }> {
    const target = (url || '').trim().replace(/\/+$/, '');
    if (!target) {
      return { ok: false, latencyMs: 0, error: 'Empty endpoint URL' };
    }

    const t0 = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(`${target}/api/v1/health`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer vault-local-admin-token',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const latencyMs = Math.round(performance.now() - t0);

      let data: any = null;
      try {
        data = await resp.json();
      } catch {}
      return { ok: resp.ok, latencyMs, data };
    } catch (err: any) {
      clearTimeout(timeout);
      const latencyMs = Math.round(performance.now() - t0);
      const isTimeout = err?.name === 'AbortError' || err?.message?.includes('aborted');
      const msg = isTimeout ? `Heartbeat timed out (>${PROBE_TIMEOUT_MS}ms)` : (err?.message || 'Network error');
      return { ok: false, latencyMs, error: msg, isTimeout };
    }
  }

  /**
   * Execute single heartbeat cycle on the currently active node.
   */
  public async triggerHeartbeat(): Promise<void> {
    const activeUrl = getApiBaseUrl();
    const targetNode: NodeTarget =
      this.colabUrl && activeUrl === this.colabUrl
        ? 'colab'
        : 'local';

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
      if (targetNode === 'colab') this.colabHealthy = true;
      if (targetNode === 'local') this.localHealthy = true;

      this.consecutiveFailures = 0;

      if (result.latencyMs > LATENCY_FAILOVER_THRESHOLD_MS && targetNode !== 'local') {
        this.highLatencyCount += 1;
      } else {
        this.highLatencyCount = 0;
      }

      if (wasOffline) {
        this.activeNode = targetNode;
        this.dispatchFailoverEvent(
          'offline',
          targetNode,
          `Node ${targetNode} recovered (${result.latencyMs}ms)`
        );
      }
    } else {
      if (targetNode === 'colab') this.colabHealthy = false;
      if (targetNode === 'local') this.localHealthy = false;

      this.consecutiveFailures += 1;
    }

    // Failover evaluation: Colab (P1) -> Local Edge (P2)
    if (this.isAutoFailoverEnabled) {
      const failureLimit = (result.isTimeout && targetNode === 'local') ? 4 : CONSECUTIVE_FAILURE_THRESHOLD;
      const shouldTrigger = this.consecutiveFailures >= failureLimit;

      if (shouldTrigger) {
        const failReason =
          this.consecutiveFailures >= failureLimit
            ? `Node ${targetNode} dropped ${this.consecutiveFailures} consecutive heartbeats`
            : `Node ${targetNode} latency exceeded ${LATENCY_FAILOVER_THRESHOLD_MS}ms (${this.currentLatencyMs}ms)`;

        await this.executeTieredFailover(targetNode, failReason);
        return;
      }
    }

    this.notify();
  }

  /**
   * Execute Tiered Failover following strict priority:
   * Colab (P1) -> Local Edge (P2)
   */
  private async executeTieredFailover(failedNode: NodeTarget, reason: string): Promise<void> {
    console.warn(`[FailoverAgent] ⚡ Node [${failedNode}] degraded/offline (${reason}). Evaluating fallback tier...`);

    // Priority 1: Check Colab GPU if not the failed node and URL is provided
    if (failedNode !== 'colab' && this.colabUrl) {
      const colabProbe = await this.probeEndpoint(this.colabUrl);
      if (colabProbe.ok) {
        await this.switchToColab(`Failover from ${failedNode}: Colab GPU healthy (${colabProbe.latencyMs}ms)`);
        return;
      }
    }

    // Priority 2: Sovereign Local Edge Node if not the failed node
    if (failedNode !== 'local' && this.localUrl) {
      const localProbe = await this.probeEndpoint(this.localUrl);
      if (localProbe.ok) {
        await this.switchToLocal(`Cloud node unavailable; failed over to Sovereign Local Edge Node`);
        return;
      }
    }

    // If all configured nodes are unreachable
    this.activeNode = 'offline';
    this.lastFailoverReason = `All backend nodes unreachable (${reason})`;
    this.notify();
  }

  /**
   * Switch active node to Colab GPU Cloud Tunnel.
   */
  public async switchToColab(reason?: string, targetUrl?: string): Promise<void> {
    const prev = this.activeNode;
    const url = (targetUrl || this.colabUrl).trim().replace(/\/+$/, '');
    if (!url) return;

    this.colabUrl = url;
    this.activeNode = 'colab';
    this.consecutiveFailures = 0;
    this.highLatencyCount = 0;
    this.lastFailoverReason = reason;
    this.lastFailoverAt = Date.now();

    setApiBaseUrl(url);
    if (typeof window !== 'undefined') {
      localStorage.setItem('clinixvault_colab_url', url);
    }
    this.notify();
    this.dispatchFailoverEvent(prev, 'colab', reason || 'Switched to Colab GPU Tunnel');
  }

  /**
   * Switch active node to Sovereign Local Edge Node.
   */
  public async switchToLocal(reason?: string): Promise<void> {
    const prev = this.activeNode;
    this.activeNode = 'local';
    this.consecutiveFailures = 0;
    this.highLatencyCount = 0;
    this.lastFailoverReason = reason;
    this.lastFailoverAt = Date.now();

    setApiBaseUrl(this.localUrl);
    this.notify();
    this.dispatchFailoverEvent(prev, 'local', reason || 'Switched to Local Edge Node');
  }

  /**
   * Legacy alias for backward compatibility.
   */
  public async executeFailoverToLocal(reason: string): Promise<void> {
    return this.switchToLocal(reason);
  }

  private dispatchFailoverEvent(from: NodeStatus, to: NodeStatus, reason: string): void {
    const detail = {
      from,
      to,
      reason,
      url: getApiBaseUrl(),
      timestamp: Date.now(),
    };

    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('clinixvault:node_failover', { detail }));
  }

  /**
   * Background Promotion Probe: checks higher-priority GPU tiers when running on local edge.
   * Priority: Colab (P1)
   */
  private async probeHigherTierRecovery(): Promise<void> {
    if (!this.isAutoFailoverEnabled) return;

    // If running on Local or Offline, check if Colab (P1) is configured and back online
    if (this.activeNode === 'local' || this.activeNode === 'offline') {
      if (this.colabUrl) {
        const colabProbe = await this.probeEndpoint(this.colabUrl);
        if (colabProbe.ok && colabProbe.latencyMs < 2500) {
          this.colabHealthy = true;
          console.info(`[FailoverAgent] 🚀 Priority 1 Colab GPU online (${colabProbe.latencyMs}ms). Promoting active node.`);
          await this.switchToColab(`Priority 1 Colab GPU online (${colabProbe.latencyMs}ms)`);
          return;
        }
      }
    }
  }

  /**
   * Start continuous heartbeat loops and return unsubscribe cleanup function.
   */
  public start(): () => void {
    this.startHeartbeat();
    return () => this.stopHeartbeat();
  }

  /**
   * Start continuous heartbeat loops.
   */
  public startHeartbeat(): void {
    if (this.timerId) return;

    void this.triggerHeartbeat();

    this.timerId = setInterval(() => {
      void this.triggerHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    this.backgroundPromotionTimer = setInterval(() => {
      void this.probeHigherTierRecovery();
    }, 10000);
  }

  /**
   * Stop heartbeat loops.
   */
  public stopHeartbeat(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.backgroundPromotionTimer) {
      clearInterval(this.backgroundPromotionTimer);
      this.backgroundPromotionTimer = null;
    }
  }
}

export const failoverAgent = new NodeFailoverAgent();
