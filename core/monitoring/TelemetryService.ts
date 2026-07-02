export interface ISessionMetrics {
  totalTokensUsed: number;
  averageLatencyMs: number;
  activeMemoryCount: number;
  archivedMemoryCount: number;
}

export class TelemetryService {
  private totalTokensUsed = 0;
  private latencySampleCount = 0;
  private latencySumMs = 0;
  private activeMemoryCount = 0;
  private archivedMemoryCount = 0;

  recordTokenUsage(tokens: number): void {
    this.totalTokensUsed += tokens;
    this.emit('token_usage', { tokens, totalTokensUsed: this.totalTokensUsed });
  }

  recordLatency(ms: number): void {
    this.latencySampleCount += 1;
    this.latencySumMs += ms;
    this.emit('latency', { ms, averageLatencyMs: this.getAverageLatencyMs() });
  }

  recordMemoryDistribution(activeCount: number, archivedCount: number): void {
    this.activeMemoryCount = activeCount;
    this.archivedMemoryCount = archivedCount;
    this.emit('memory_distribution', { activeCount, archivedCount });
  }

  getSnapshot(): ISessionMetrics {
    return {
      totalTokensUsed: this.totalTokensUsed,
      averageLatencyMs: this.getAverageLatencyMs(),
      activeMemoryCount: this.activeMemoryCount,
      archivedMemoryCount: this.archivedMemoryCount
    };
  }

  private getAverageLatencyMs(): number {
    return this.latencySampleCount === 0 ? 0 : Math.round(this.latencySumMs / this.latencySampleCount);
  }

  // Deferred + guarded: today's sink is console.log, tomorrow's may be a
  // network call to Prometheus/Grafana. Either way, telemetry must never
  // throw back into the caller's chat flow.
  private emit(event: string, payload: Record<string, unknown>): void {
    queueMicrotask(() => {
      try {
        console.log(JSON.stringify({ event, timestamp: Date.now(), ...payload }));
      } catch (error) {
        console.warn('TelemetryService: failed to log event', event, error);
      }
    });
  }
}
