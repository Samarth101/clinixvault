/**
 * ClinixVault Automated Multi-Provider Failover Agent
 *
 * Tiered GPU & Cloud Gateway Failover Architecture:
 * Priority 1: Google Colab GPU Cloud Tunnel (Tesla T4 15GB VRAM — user-provided via frontend)
 * Priority 2: Sovereign Local Edge Node (Apple Silicon MPS / Local Ollama / C++ SIMD)
 * Priority 3: Render Cloud Gateway (https://clinixvault-backend.onrender.com)
 *
 * Failover Rules:
 * - Colab tunnel is dynamically provided via frontend (no hardcoded URLs).
 * - Priority order: Colab (P1) -> Local Edge (P2) -> Render Cloud Gateway (P3).
 * - If Colab drops 3 consecutive heartbeats or is unconfigured:
 *   -> Probes Priority 2 (Local Edge Node).
 *   -> If Local Edge is offline or unreachable (e.g. browsing from Vercel WAN),
 *      seamlessly falls back to Priority 3 (Render Cloud Gateway).
 * - Background Promotion:
 *   -> When running on Local Edge or Render, continuously probes Colab in background.
 *   -> As soon as the clinician starts a Colab tunnel and pastes it, or an existing
 *      Colab tunnel recovers, automatically promotes back to Colab GPU!
 */

import { getApiBaseUrl, setApiBaseUrl } from './api';

export type NodeTarget = 'colab' | 'render' | 'local';
export type NodeStatus = 'colab' | 'render' | 'local' | 'offline';

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
  renderUrl: string;
  localUrl: string;
  isAutoFailoverEnabled: boolean;
  consecutiveFailures: number;
  latencyMs: number;
  lastHeartbeatAt: number;
  colabHealthy: boolean;
  renderHealthy: boolean;
  localHealthy: boolean;
  recentHeartbeats: HeartbeatLog[];
  lastFailoverReason?: string;
  lastFailoverAt?: number;
  gpuPriority: NodeTarget[];
}

const DEFAULT_COLAB_URL = '';
const DEFAULT_RENDER_URL = 'https://clinixvault-backend.onrender.com';
const DEFAULT_LOCAL_URL = 'http://127.0.0.1:8000';

const LATENCY_FAILOVER_THRESHOLD_MS = 6000;
const CONSECUTIVE_FAILURE_THRESHOLD = 3;
const HEARTBEAT_INTERVAL_MS = 3000;
const PROBE_TIMEOUT_MS = 6500;

class NodeFailoverAgent {
  private colabUrl: string = DEFAULT_COLAB_URL;
  private renderUrl: string = DEFAULT_RENDER_URL;
  private localUrl: string = DEFAULT_LOCAL_URL;

  private isAutoFailoverEnabled: boolean = true;
  private activeNode: NodeStatus = 'local';
  private consecutiveFailures: number = 0;
  private highLatencyCount: number = 0;
  private currentLatencyMs: number = 0;
  private lastHeartbeatAt: number = 0;

  private colabHealthy: boolean = false;
  private renderHealthy: boolean = false;
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

    const savedRender = localStorage.getItem('clinixvault_render_url');
    if (savedRender && savedRender.trim()) {
      this.renderUrl = savedRender.trim().replace(/\/+$/, '');
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
    if (current && (current.includes('127.0.0.1') || current.includes('localhost'))) {
      this.activeNode = 'local';
    } else if (current && current.includes('onrender.com')) {
      this.activeNode = 'render';
      this.renderUrl = current;
    } else if (current && (current.includes('trycloudflare.com') || (this.colabUrl && current === this.colabUrl))) {
      this.activeNode = 'colab';
      this.colabUrl = current;
    } else {
      // If running on HTTPS deployment (e.g. Vercel) and no explicit URL configured:
      if (typeof window !== 'undefined' && window.location.protocol === 'https:' && !window.location.hostname.includes('localhost')) {
        this.activeNode = 'render';
      } else {
        this.activeNode = 'local';
      }
    }
  }

  public getState(): FailoverState {
    return {
      activeNode: this.activeNode,
      currentUrl: getApiBaseUrl(),
      colabUrl: this.colabUrl,
      renderUrl: this.renderUrl,
      localUrl: this.localUrl,
      isAutoFailoverEnabled: this.isAutoFailoverEnabled,
      consecutiveFailures: this.consecutiveFailures,
      latencyMs: this.currentLatencyMs,
      lastHeartbeatAt: this.lastHeartbeatAt,
      colabHealthy: this.colabHealthy,
      renderHealthy: this.renderHealthy,
      localHealthy: this.localHealthy,
      recentHeartbeats: [...this.recentHeartbeats],
      lastFailoverReason: this.lastFailoverReason,
      lastFailoverAt: this.lastFailoverAt,
      gpuPriority: ['colab', 'local', 'render'],
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

  public setRenderUrl(url: string): void {
    const clean = (url || '').trim().replace(/\/+$/, '');
    if (!clean) return;
    this.renderUrl = clean;
    if (typeof window !== 'undefined') {
      localStorage.setItem('clinixvault_render_url', clean);
    }
    if (this.activeNode === 'render') {
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
   * Probes endpoint with timeout and latency calculation.
   */
  public async probeEndpoint(
    url: string
  ): Promise<{ ok: boolean; latencyMs: number; data?: any; error?: string; isTimeout?: boolean }> {
    const target = (url || '').trim().replace(/\/+$/, '');
    if (!target) {
      return { ok: false, latencyMs: 0, error: 'Endpoint not configured' };
    }

    const t0 = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

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
        : activeUrl === this.renderUrl
        ? 'render'
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
      if (targetNode === 'render') this.renderHealthy = true;
      if (targetNode === 'local') this.localHealthy = true;

      this.consecutiveFailures = 0;

      if (targetNode === 'render') {
        this.highLatencyCount = 0;
      } else if (result.latencyMs > LATENCY_FAILOVER_THRESHOLD_MS && targetNode !== 'local') {
        this.highLatencyCount += 1;
      } else {
        this.highLatencyCount = 0;
      }

      this.activeNode = targetNode;

      if (wasOffline && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('clinixvault:backend_recovered', {
            detail: { node: this.activeNode, url: activeUrl, latencyMs: result.latencyMs },
          })
        );
      }
    } else {
      if (targetNode === 'colab') this.colabHealthy = false;
      if (targetNode === 'render') this.renderHealthy = false;
      if (targetNode === 'local') this.localHealthy = false;

      this.consecutiveFailures += 1;
    }

    // Failover evaluation: Colab (P1) -> Local Edge (P2) -> Render Gateway (P3)
    if (this.isAutoFailoverEnabled) {
      const failureLimit = (result.isTimeout && targetNode === 'local') ? 4 : CONSECUTIVE_FAILURE_THRESHOLD;
      const shouldTrigger = this.consecutiveFailures >= failureLimit || (targetNode !== 'render' && this.highLatencyCount >= 4);

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
   * Colab (P1) -> Local Edge (P2) -> Render Gateway (P3)
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

    // Priority 3: Render Cloud Gateway if not the failed node
    if (failedNode !== 'render' && this.renderUrl) {
      const renderProbe = await this.probeEndpoint(this.renderUrl);
      if (renderProbe.ok) {
        await this.switchToRender(`Failover from ${failedNode}: Render Cloud Gateway online (${renderProbe.latencyMs}ms)`);
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
    if (targetUrl) {
      const clean = targetUrl.trim().replace(/\/+$/, '');
      if (clean) this.colabUrl = clean;
    }
    if (!this.colabUrl) return;

    const prev = this.activeNode;
    this.activeNode = 'colab';
    this.consecutiveFailures = 0;
    this.highLatencyCount = 0;
    this.lastFailoverReason = reason;
    this.lastFailoverAt = Date.now();

    setApiBaseUrl(this.colabUrl);
    this.notify();
    this.dispatchFailoverEvent(prev, 'colab', reason || 'Switched to Colab GPU Node');
  }

  /**
   * Switch active node to Sovereign Local Edge Node.
   */
  public async switchToLocal(reason?: string): Promise<void> {
    const prev = this.activeNode;
    this.lastFailoverReason = reason;
    this.lastFailoverAt = Date.now();
    this.activeNode = 'local';
    this.consecutiveFailures = 0;
    this.highLatencyCount = 0;

    setApiBaseUrl(this.localUrl);

    // Switch inference models to local edge models
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
    this.dispatchFailoverEvent(prev, 'local', reason || 'Switched to Local Edge Node');
  }

  /**
   * Switch active node to Render Cloud Gateway.
   */
  public async switchToRender(reason?: string, targetUrl?: string): Promise<void> {
    if (targetUrl) {
      const clean = targetUrl.trim().replace(/\/+$/, '');
      if (clean) this.renderUrl = clean;
    }
    const prev = this.activeNode;
    this.activeNode = 'render';
    this.consecutiveFailures = 0;
    this.highLatencyCount = 0;
    this.lastFailoverReason = reason;
    this.lastFailoverAt = Date.now();

    setApiBaseUrl(this.renderUrl);
    this.notify();
    this.dispatchFailoverEvent(prev, 'render', reason || 'Switched to Render Cloud Gateway');
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
   * Background Promotion Probe: checks higher-priority GPU tiers when running on lower tiers.
   * Priority: Colab (P1) -> Local Edge (P2)
   */
  private async probeHigherTierRecovery(): Promise<void> {
    if (!this.isAutoFailoverEnabled) return;

    // If running on Local or Render, check if Colab (P1) is configured and back online
    if (this.activeNode === 'local' || this.activeNode === 'render' || this.activeNode === 'offline') {
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

    // If running on Render or Offline, check if Local Edge (P2) is online
    if (this.activeNode === 'render' || this.activeNode === 'offline') {
      if (this.localUrl) {
        const localProbe = await this.probeEndpoint(this.localUrl);
        if (localProbe.ok && localProbe.latencyMs < 1500) {
          this.localHealthy = true;
          console.info(`[FailoverAgent] 💻 Priority 2 Local Edge online (${localProbe.latencyMs}ms). Promoting active node.`);
          await this.switchToLocal(`Priority 2 Local Edge online (${localProbe.latencyMs}ms)`);
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
   * Stop heartbeat monitoring.
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

if (typeof window !== 'undefined') {
  failoverAgent.startHeartbeat();
}
