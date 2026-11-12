/**
 * ClinixVault Automated Multi-Provider Failover Agent
 *
 * Tiered Tri-Node GPU & Cloud Gateway Failover Architecture:
 * Priority 1: Google Colab GPU Cloud Tunnel (Tesla T4 15GB VRAM)
 * Priority 2: Hugging Face Spaces GPU Node (ZeroGPU Nvidia A100 / T4)
 * Priority 3: Sovereign Local Edge Node (Apple Silicon MPS / Local Ollama)
 * Cloud Gateway: Render.com Backend Gateway
 *
 * Failover Rules:
 * - If Priority 1 (Colab) drops 3 consecutive heartbeats or latency > 1,200ms:
 *   -> Probes Priority 2 (HF Spaces). If reachable, seamlessly fails over to HF Spaces!
 *   -> If HF Spaces is offline/sleeping, fails over to Priority 3 (Local Edge Node).
 * - If Priority 2 (HF Spaces) encounters ZeroGPU 5-minute quota / timeout / sleeps:
 *   -> Immediately checks Priority 1 (Colab), and if unavailable, falls back to Local Edge Node.
 * - Background Promotion:
 *   -> When running on Local Edge or HF Spaces, continuously probes Colab in background.
 *   -> When Colab or HF Spaces recovers, automatically promotes or alerts clinician.
 */

import { getApiBaseUrl, setApiBaseUrl } from './api';

export type NodeTarget = 'colab' | 'hf_spaces' | 'render' | 'local';
export type NodeStatus = 'colab' | 'hf_spaces' | 'render' | 'local' | 'offline';

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
  hfSpacesUrl: string;
  renderUrl: string;
  localUrl: string;
  isAutoFailoverEnabled: boolean;
  consecutiveFailures: number;
  latencyMs: number;
  lastHeartbeatAt: number;
  colabHealthy: boolean;
  hfSpacesHealthy: boolean;
  renderHealthy: boolean;
  localHealthy: boolean;
  recentHeartbeats: HeartbeatLog[];
  lastFailoverReason?: string;
  lastFailoverAt?: number;
  gpuPriority: NodeTarget[];
}

const DEFAULT_COLAB_URL = 'https://barry-cake-sugar-elizabeth.trycloudflare.com';
const DEFAULT_HF_SPACES_URL = 'https://clinixvault-inference.hf.space';
const DEFAULT_RENDER_URL = 'https://clinixvault-backend.onrender.com';
const DEFAULT_LOCAL_URL = 'http://127.0.0.1:8000';

const LATENCY_FAILOVER_THRESHOLD_MS = 6000;
const CONSECUTIVE_FAILURE_THRESHOLD = 3;
const HEARTBEAT_INTERVAL_MS = 3000;
const PROBE_TIMEOUT_MS = 6500;

class NodeFailoverAgent {
  private colabUrl: string = DEFAULT_COLAB_URL;
  private hfSpacesUrl: string = DEFAULT_HF_SPACES_URL;
  private renderUrl: string = DEFAULT_RENDER_URL;
  private localUrl: string = DEFAULT_LOCAL_URL;

  private isAutoFailoverEnabled: boolean = true;
  private activeNode: NodeStatus = 'colab';
  private consecutiveFailures: number = 0;
  private highLatencyCount: number = 0;
  private currentLatencyMs: number = 0;
  private lastHeartbeatAt: number = 0;

  private colabHealthy: boolean = true;
  private hfSpacesHealthy: boolean = false;
  private renderHealthy: boolean = false;
  private localHealthy: boolean = true;

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
      if (!savedColab.includes('consistent-testimonials')) {
        this.colabUrl = savedColab.trim().replace(/\/+$/, '');
      }
    }

    const savedHf = localStorage.getItem('clinixvault_hf_spaces_url');
    if (savedHf && savedHf.trim()) {
      this.hfSpacesUrl = savedHf.trim().replace(/\/+$/, '');
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
    if (current.includes('127.0.0.1') || current.includes('localhost')) {
      this.activeNode = 'local';
    } else if (current.includes('hf.space')) {
      this.activeNode = 'hf_spaces';
      this.hfSpacesUrl = current;
    } else if (current.includes('onrender.com')) {
      this.activeNode = 'render';
      this.renderUrl = current;
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
      hfSpacesUrl: this.hfSpacesUrl,
      renderUrl: this.renderUrl,
      localUrl: this.localUrl,
      isAutoFailoverEnabled: this.isAutoFailoverEnabled,
      consecutiveFailures: this.consecutiveFailures,
      latencyMs: this.currentLatencyMs,
      lastHeartbeatAt: this.lastHeartbeatAt,
      colabHealthy: this.colabHealthy,
      hfSpacesHealthy: this.hfSpacesHealthy,
      renderHealthy: this.renderHealthy,
      localHealthy: this.localHealthy,
      recentHeartbeats: [...this.recentHeartbeats],
      lastFailoverReason: this.lastFailoverReason,
      lastFailoverAt: this.lastFailoverAt,
      gpuPriority: ['colab', 'hf_spaces', 'local'],
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

  public setHfSpacesUrl(url: string): void {
    const clean = (url || '').trim().replace(/\/+$/, '');
    if (!clean) return;
    this.hfSpacesUrl = clean;
    if (typeof window !== 'undefined') {
      localStorage.setItem('clinixvault_hf_spaces_url', clean);
    }
    if (this.activeNode === 'hf_spaces') {
      setApiBaseUrl(clean);
    }
    this.notify();
    void this.triggerHeartbeat();
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
   * Probe an endpoint with a strict abort timeout.
   */
  public async probeEndpoint(
    url: string
  ): Promise<{ ok: boolean; latencyMs: number; error?: string; isTimeout?: boolean; data?: any }> {
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
      activeUrl === this.colabUrl
        ? 'colab'
        : activeUrl === this.hfSpacesUrl
        ? 'hf_spaces'
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
      if (targetNode === 'hf_spaces') this.hfSpacesHealthy = true;
      if (targetNode === 'render') this.renderHealthy = true;
      if (targetNode === 'local') this.localHealthy = true;

      this.consecutiveFailures = 0;

      // Track latency threshold on cloud GPU nodes
      // Note: Render Cloud Gateway is a cloud web service whose healthy international WAN
      // latency (1-3s) must NOT be penalized or downgraded to localhost.
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
      if (targetNode === 'hf_spaces') this.hfSpacesHealthy = false;
      if (targetNode === 'render') this.renderHealthy = false;
      if (targetNode === 'local') this.localHealthy = false;

      this.consecutiveFailures += 1;
    }

    // Failover evaluation: Colab -> HF Spaces -> Render Gateway -> Local Edge
    if (this.isAutoFailoverEnabled) {
      const failureLimit = (result.isTimeout && targetNode === 'local') ? 4 : CONSECUTIVE_FAILURE_THRESHOLD;
      // High latency failover only triggers after 4 consecutive severely degraded heartbeats (>6000ms)
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
   * Colab (P1) -> HF Spaces (P2) -> Render Gateway -> Local Edge (P3)
   */
  private async executeTieredFailover(failedNode: NodeTarget, reason: string): Promise<void> {
    console.warn(`[FailoverAgent] ⚡ Node [${failedNode}] degraded/offline (${reason}). Evaluating fallback tier...`);

    // Priority 1: Check Colab GPU if not the failed node
    if (failedNode !== 'colab' && this.colabUrl) {
      const colabProbe = await this.probeEndpoint(this.colabUrl);
      if (colabProbe.ok) {
        await this.switchToColab(`Failover from ${failedNode}: Colab GPU healthy (${colabProbe.latencyMs}ms)`);
        return;
      }
    }

    // Priority 2: Check HF Spaces GPU if not the failed node
    if (failedNode !== 'hf_spaces' && this.hfSpacesUrl) {
      const hfProbe = await this.probeEndpoint(this.hfSpacesUrl);
      if (hfProbe.ok) {
        await this.switchToHfSpaces(`Failover from ${failedNode}: HF Spaces node online (${hfProbe.latencyMs}ms)`);
        return;
      }
    }

    // Priority 3: Check Render Cloud Gateway if not the failed node
    if (failedNode !== 'render' && this.renderUrl) {
      const renderProbe = await this.probeEndpoint(this.renderUrl);
      if (renderProbe.ok) {
        await this.switchToRender(`Failover from ${failedNode}: Render Cloud Gateway online (${renderProbe.latencyMs}ms)`);
        return;
      }
    }

    // Priority 4: Fall back to Sovereign Local Edge Node if not the failed node
    if (failedNode !== 'local' && this.localUrl) {
      const localProbe = await this.probeEndpoint(this.localUrl);
      if (localProbe.ok) {
        await this.switchToLocal(`Cloud services unavailable; failed over to Sovereign Local Edge Node`);
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
   * Switch active node to Hugging Face Spaces GPU Node.
   */
  public async switchToHfSpaces(reason?: string, targetUrl?: string): Promise<void> {
    if (targetUrl) {
      const clean = targetUrl.trim().replace(/\/+$/, '');
      if (clean) this.hfSpacesUrl = clean;
    }
    const prev = this.activeNode;
    this.activeNode = 'hf_spaces';
    this.consecutiveFailures = 0;
    this.highLatencyCount = 0;
    this.lastFailoverReason = reason;
    this.lastFailoverAt = Date.now();

    setApiBaseUrl(this.hfSpacesUrl);
    this.notify();
    this.dispatchFailoverEvent(prev, 'hf_spaces', reason || 'Switched to Hugging Face Spaces ZeroGPU Node');
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
   * Legacy alias for backward compatibility.
   */
  public async executeFailoverToLocal(reason: string): Promise<void> {
    return this.switchToLocal(reason);
  }

  private dispatchFailoverEvent(from: NodeStatus, to: NodeStatus, reason: string): void {
    if (typeof window === 'undefined') return;
    const detail = {
      from,
      to,
      reason,
      url: getApiBaseUrl(),
      timestamp: Date.now(),
    };
    window.dispatchEvent(new CustomEvent('clinixvault:failover_event', { detail }));
    window.dispatchEvent(new CustomEvent('clinixvault:node_failover', { detail }));
  }

  /**
   * Background Promotion Probe: checks higher-priority GPU tiers when running on lower tiers.
   * Priority: Colab (P1) -> HF Spaces (P2)
   */
  private async probeHigherTierRecovery(): Promise<void> {
    if (!this.isAutoFailoverEnabled) return;

    // If running on Local or HF Spaces or Render, check if Colab (P1) is back online
    if (this.activeNode === 'local' || this.activeNode === 'hf_spaces' || this.activeNode === 'render' || this.activeNode === 'offline') {
      if (this.colabUrl) {
        const colabProbe = await this.probeEndpoint(this.colabUrl);
        if (colabProbe.ok && colabProbe.latencyMs < 2500) {
          this.colabHealthy = true;
          console.info(`[FailoverAgent] 🚀 Priority 1 Colab GPU recovered (${colabProbe.latencyMs}ms). Promoting active node.`);
          await this.switchToColab(`Priority 1 Colab GPU recovered (${colabProbe.latencyMs}ms)`);
          return;
        }
      }
    }

    // If running on Local or Offline, check if HF Spaces (P2) is online
    if (this.activeNode === 'local' || this.activeNode === 'offline') {
      if (this.hfSpacesUrl) {
        const hfProbe = await this.probeEndpoint(this.hfSpacesUrl);
        if (hfProbe.ok && hfProbe.latencyMs < 3500) {
          this.hfSpacesHealthy = true;
          console.info(`[FailoverAgent] ⚡ Priority 2 HF Spaces node online (${hfProbe.latencyMs}ms). Promoting active node.`);
          await this.switchToHfSpaces(`Priority 2 HF Spaces node online (${hfProbe.latencyMs}ms)`);
          return;
        }
      }

      // If neither Colab nor HF Spaces are online, check if Render Cloud Gateway is available
      if (this.renderUrl) {
        const renderProbe = await this.probeEndpoint(this.renderUrl);
        if (renderProbe.ok) {
          this.renderHealthy = true;
          console.info(`[FailoverAgent] ☁️ Render Cloud Gateway online (${renderProbe.latencyMs}ms). Promoting active node.`);
          await this.switchToRender(`Render Cloud Gateway online (${renderProbe.latencyMs}ms)`);
          return;
        }
      }
    }
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

    this.backgroundPromotionTimer = setInterval(() => {
      void this.probeHigherTierRecovery();
    }, 10000);

    return () => this.stop();
  }

  public stop(): void {
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
