/**
 * ClinixVault Frontend Telemetry Service
 * Emits user interaction telemetry (button clicks, navigation, page views)
 * to the API Gateway for Prometheus & Grafana Cloud ingestion.
 */

const rawApiUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
const API_BASE_URL = (rawApiUrl || '').replace(/\/+$/, '');

export interface TelemetryEventPayload {
  event_type: 'button_click' | 'page_view' | 'modal_open' | 'action';
  component: string;
  button_id?: string;
  page?: string;
  metadata?: Record<string, any>;
}

class TelemetryService {
  private queue: TelemetryEventPayload[] = [];
  private flushTimer: number | null = null;

  public track(event: TelemetryEventPayload): void {
    this.queue.push(event);

    // Debounced flush within 300ms or immediate if queue is large
    if (this.queue.length >= 5) {
      this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = window.setTimeout(() => this.flush(), 400);
    }
  }

  public trackButtonClick(component: string, buttonId: string, page?: string): void {
    this.track({
      event_type: 'button_click',
      component,
      button_id: buttonId,
      page,
    });
  }

  public trackPageView(page: string): void {
    this.track({
      event_type: 'page_view',
      component: 'Navigation',
      page,
    });
  }

  public trackModalOpen(modalName: string, page?: string): void {
    this.track({
      event_type: 'modal_open',
      component: modalName,
      button_id: `open_${modalName}`,
      page,
    });
  }

  public async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.queue.length === 0) return;

    const eventsToSend = [...this.queue];
    this.queue = [];

    try {
      if (eventsToSend.length === 1) {
        await fetch(`${API_BASE_URL}/api/v1/telemetry/event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(eventsToSend[0]),
        });
      } else {
        await fetch(`${API_BASE_URL}/api/v1/telemetry/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events: eventsToSend }),
        });
      }
    } catch {
      // Air-gapped silent fallback: if gateway is unreachable, swallow error
    }
  }
}

export const telemetry = new TelemetryService();
