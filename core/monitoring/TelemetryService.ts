// Conflict is counted the same way the Evolution engine penalizes it
// (conflictLevel >= 0.5), so the observed rate here lines up with the
// live reward/penalty behavior rather than being an independent guess.
const CONFLICT_LEVEL_THRESHOLD = 0.5;

// The first N recorded interactions form the "before tuning" window; their
// conflict rate is frozen as the session baseline once the Nth turn lands.
// Turns after that accrue to a disjoint "after" window, so a reported
// reduction compares two non-overlapping measured windows rather than a
// diluted cumulative-vs-cumulative figure.
const BASELINE_INTERACTION_THRESHOLD = 10;

export interface ISessionMetrics {
  totalTokensUsed: number;
  averageLatencyMs: number;
  activeMemoryCount: number;
  archivedMemoryCount: number;
  // Aggregated from the per-turn tone/conflict signals the Evolution engine
  // already emits (see recordEvolutionMetrics). All observed, session-scoped
  // counters -- no synthesized figures.
  interactionCount: number;
  conflictCount: number;
  conflictRate: number;
  averageToneScore: number;
  averageTokensPerInteraction: number;
  // Baseline/after windows for a genuine (measured, not projected) conflict
  // rate comparison. baselineConflictRate is null until BASELINE turns land;
  // postBaselineConflictRate is null until at least one turn lands after that.
  baselineInteractionThreshold: number;
  baselineConflictRate: number | null;
  postBaselineInteractionCount: number;
  postBaselineConflictRate: number | null;
  cohortId?: string;
}

export class TelemetryService {
  private totalTokensUsed = 0;
  private latencySampleCount = 0;
  private latencySumMs = 0;
  private activeMemoryCount = 0;
  private archivedMemoryCount = 0;
  private interactionCount = 0;
  private conflictCount = 0;
  private toneScoreSum = 0;
  private baselineConflictRate: number | null = null;
  private postBaselineInteractionCount = 0;
  private postBaselineConflictCount = 0;
  private cohortId?: string;

  constructor(cohortId?: string) {
    this.cohortId = cohortId;
  }

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

  recordEvolutionMetrics(metrics: Record<string, unknown>): void {
    // Aggregate the tone/conflict signals into observed counters when present.
    // Guarded by typeof so a caller passing an unrelated payload can't corrupt
    // the running averages with NaN.
    const toneScore = metrics.toneScore;
    const conflictLevel = metrics.conflictLevel;
    if (typeof toneScore === 'number' && typeof conflictLevel === 'number') {
      const isConflict = conflictLevel >= CONFLICT_LEVEL_THRESHOLD;
      this.interactionCount += 1;
      this.toneScoreSum += toneScore;
      if (isConflict) this.conflictCount += 1;

      if (this.baselineConflictRate === null) {
        // Still filling the baseline window; freeze the rate the moment the
        // Nth turn lands. This turn belongs to the baseline, not the "after".
        if (this.interactionCount >= BASELINE_INTERACTION_THRESHOLD) {
          this.baselineConflictRate = this.conflictCount / this.interactionCount;
        }
      } else {
        // Disjoint "after" window: strictly turns recorded past the baseline.
        this.postBaselineInteractionCount += 1;
        if (isConflict) this.postBaselineConflictCount += 1;
      }
    }
    this.emit('evolution_metrics', metrics);
  }

  recordDataExport(exampleCount: number): void {
    this.emit('data_export', { exampleCount });
  }

  recordCognitiveStream(content: string): void {
    this.emit('cognitive_stream', { content });
  }

  getSnapshot(): ISessionMetrics {
    return {
      totalTokensUsed: this.totalTokensUsed,
      averageLatencyMs: this.getAverageLatencyMs(),
      activeMemoryCount: this.activeMemoryCount,
      archivedMemoryCount: this.archivedMemoryCount,
      interactionCount: this.interactionCount,
      conflictCount: this.conflictCount,
      conflictRate: this.interactionCount === 0 ? 0 : this.conflictCount / this.interactionCount,
      averageToneScore: this.interactionCount === 0 ? 0 : this.toneScoreSum / this.interactionCount,
      averageTokensPerInteraction:
        this.interactionCount === 0 ? 0 : Math.round(this.totalTokensUsed / this.interactionCount),
      baselineInteractionThreshold: BASELINE_INTERACTION_THRESHOLD,
      baselineConflictRate: this.baselineConflictRate,
      postBaselineInteractionCount: this.postBaselineInteractionCount,
      postBaselineConflictRate:
        this.postBaselineInteractionCount === 0
          ? null
          : this.postBaselineConflictCount / this.postBaselineInteractionCount,
      cohortId: this.cohortId
    };
  }

  private getAverageLatencyMs(): number {
    return this.latencySampleCount === 0 ? 0 : Math.round(this.latencySumMs / this.latencySampleCount);
  }

  // Deferred + guarded: today's sink is console.log, tomorrow's may be a
  // network call to Prometheus/Grafana. Either way, telemetry must never
  // throw back into the caller's chat flow. cohortId is stamped on every
  // line here so 'control' vs 'variant' can be compared without every
  // record* call site having to pass it through manually.
  private emit(event: string, payload: Record<string, unknown>): void {
    queueMicrotask(() => {
      try {
        console.log(JSON.stringify({ event, timestamp: Date.now(), cohortId: this.cohortId, ...payload }));
      } catch (error) {
        console.warn('TelemetryService: failed to log event', event, error);
      }
    });
  }
}
