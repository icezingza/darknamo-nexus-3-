import { ISessionMetrics } from '../core/monitoring/TelemetryService';
import { PitchSummary } from '../core/pipeline/DataExporter';

// Automated telemetry -> pitch report.
//
// INTEGRITY CONTRACT: every number in this report is copied or arithmetically
// derived from real, observed session counters (TelemetryService.getSnapshot)
// and the real golden-dataset summary (DataExporter.buildPitchSummary). This
// module does NOT invent baselines, does NOT project a "% reduction", and does
// NOT synthesize numbers when data is missing. With zero interactions it
// reports zeros and says so -- it never manufactures a flattering figure to
// fill a gap. The report is explicitly labelled session-scoped so a reader
// cannot mistake one session's telemetry for aggregate, validated production
// performance.

export interface PitchReport {
  generatedAt: string;
  scope: string;
  disclaimer: string;
  hasData: boolean;
  cohortId?: string;
  responsiveness: {
    averageTimeToInteractMs: number;
    sampleCount: number;
  };
  tokenEfficiency: {
    totalTokensUsed: number;
    averageTokensPerInteraction: number;
  };
  emotionalAlignment: {
    observedConflictRate: number;
    conflictInteractions: number;
    averageToneScore: number;
  };
  // Measured within-session before/after: the first-N-turn baseline window
  // vs the disjoint window of turns recorded after it. reductionPct is null
  // (with an explanatory note) whenever a genuine comparison isn't possible,
  // never a fabricated stand-in.
  conflictReduction: {
    status: 'ok' | 'insufficient_data' | 'no_baseline_conflict';
    baselineConflictRate: number | null;
    recentConflictRate: number | null;
    reductionPct: number | null;
    note: string;
  };
  dataset?: {
    goldenExampleCount: number;
    highValueMemoryCount: number;
    totalRecords: number;
    minEmotionWeight: number;
  };
}

const SCOPE = 'single live session (observed telemetry)';
const DISCLAIMER =
  'All figures are observed counters from one live session, including the conflict-rate ' +
  'reduction, which is a measured within-session comparison of two disjoint windows -- not ' +
  'a projection. They are NOT aggregate, benchmarked, or validated production metrics.';

// Genuine before/after from the two disjoint measured windows. Returns a null
// reductionPct with an explanatory note (never a fabricated number) when a
// real comparison can't be made: too few turns for a baseline, no turns yet
// after the baseline, or a zero baseline (nothing to reduce against).
const buildConflictReduction = (snapshot: ISessionMetrics): PitchReport['conflictReduction'] => {
  const { baselineConflictRate, postBaselineConflictRate, postBaselineInteractionCount, baselineInteractionThreshold } = snapshot;

  if (baselineConflictRate === null || postBaselineInteractionCount === 0 || postBaselineConflictRate === null) {
    return {
      status: 'insufficient_data',
      baselineConflictRate,
      recentConflictRate: postBaselineConflictRate,
      reductionPct: null,
      note: `Insufficient data for baseline comparison: need ${baselineInteractionThreshold}+ baseline turns and at least one turn after the baseline.`
    };
  }

  if (baselineConflictRate === 0) {
    return {
      status: 'no_baseline_conflict',
      baselineConflictRate,
      recentConflictRate: postBaselineConflictRate,
      reductionPct: null,
      note: 'Baseline conflict rate was 0 -- there is nothing to reduce against; rates reported as-is.'
    };
  }

  // Signed on purpose: a negative value (conflict rose) is reported honestly.
  const reductionPct = ((baselineConflictRate - postBaselineConflictRate) / baselineConflictRate) * 100;
  return {
    status: 'ok',
    baselineConflictRate,
    recentConflictRate: postBaselineConflictRate,
    reductionPct,
    note: `Measured: first-${baselineInteractionThreshold}-turn baseline vs the disjoint window of later turns (same session).`
  };
};

// Pure: snapshot in, report out. Injectable for tests and callable from either
// the UI (live snapshot) or a Node context (snapshot loaded from a file).
export const generatePitchReport = (
  snapshot: ISessionMetrics,
  summary?: PitchSummary,
  scopeLabel: string = SCOPE
): PitchReport => {
  const report: PitchReport = {
    generatedAt: new Date().toISOString(),
    scope: scopeLabel,
    disclaimer: DISCLAIMER,
    hasData: snapshot.interactionCount > 0,
    cohortId: snapshot.cohortId,
    responsiveness: {
      averageTimeToInteractMs: snapshot.averageLatencyMs,
      sampleCount: snapshot.interactionCount
    },
    tokenEfficiency: {
      totalTokensUsed: snapshot.totalTokensUsed,
      averageTokensPerInteraction: snapshot.averageTokensPerInteraction
    },
    emotionalAlignment: {
      observedConflictRate: snapshot.conflictRate,
      conflictInteractions: snapshot.conflictCount,
      averageToneScore: snapshot.averageToneScore
    },
    conflictReduction: buildConflictReduction(snapshot)
  };

  if (summary) {
    report.dataset = {
      goldenExampleCount: summary.goldenExampleCount,
      highValueMemoryCount: summary.highValueMemoryCount,
      totalRecords: summary.totalRecords,
      minEmotionWeight: summary.minEmotionWeight
    };
  }

  return report;
};

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

// Human-readable rendering for a console/markdown pitch deck appendix.
export const formatPitchReport = (report: PitchReport): string => {
  const lines: string[] = [];
  lines.push('# Namo ACC — Telemetry Pitch Report');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Scope: ${report.scope}`);
  lines.push('');

  if (!report.hasData) {
    lines.push('> No interactions recorded this session — no metrics to report.');
    lines.push('');
    lines.push(`_${report.disclaimer}_`);
    return lines.join('\n');
  }

  if (report.cohortId) lines.push(`Cohort: ${report.cohortId}`);
  lines.push('');
  lines.push('## Responsiveness');
  lines.push(`- Average Time-To-Interact: ${report.responsiveness.averageTimeToInteractMs} ms`);
  lines.push(`- Interactions sampled: ${report.responsiveness.sampleCount}`);
  lines.push('');
  lines.push('## Token Efficiency');
  lines.push(`- Total tokens used: ${report.tokenEfficiency.totalTokensUsed}`);
  lines.push(`- Average tokens per interaction: ${report.tokenEfficiency.averageTokensPerInteraction}`);
  lines.push('');
  lines.push('## Emotional Alignment (observed)');
  lines.push(`- Observed conflict rate: ${pct(report.emotionalAlignment.observedConflictRate)} ` +
    `(${report.emotionalAlignment.conflictInteractions}/${report.responsiveness.sampleCount} turns)`);
  lines.push(`- Average tone score: ${report.emotionalAlignment.averageToneScore.toFixed(3)}`);

  const cr = report.conflictReduction;
  lines.push('');
  lines.push('### Conflict Rate Reduction (measured, within-session)');
  if (cr.status === 'ok' && cr.reductionPct !== null) {
    const verb = cr.reductionPct >= 0 ? 'reduction' : 'increase';
    lines.push(`- Baseline conflict rate: ${pct(cr.baselineConflictRate as number)}`);
    lines.push(`- Recent conflict rate: ${pct(cr.recentConflictRate as number)}`);
    lines.push(`- Measured ${verb}: ${Math.abs(cr.reductionPct).toFixed(1)}%`);
  } else {
    lines.push(`- ${cr.note}`);
  }

  if (report.dataset) {
    lines.push('');
    lines.push('## Golden Dataset');
    lines.push(`- High-value memories retained (weight > ${report.dataset.minEmotionWeight}): ${report.dataset.highValueMemoryCount}`);
    lines.push(`- Golden training examples: ${report.dataset.goldenExampleCount}`);
    lines.push(`- Total records considered: ${report.dataset.totalRecords}`);
  }

  lines.push('');
  lines.push(`_${report.disclaimer}_`);
  return lines.join('\n');
};

// ── Cross-session aggregation ──────────────────────────────────────────────────
//
// Combines many persisted session snapshots (from TelemetrySessionStore) into a
// single ISessionMetrics-shaped aggregate so the existing report/reduction logic
// works unchanged. Every aggregate is a faithful roll-up of real counters:
// - additive counters (tokens, interactions, conflicts) are summed;
// - rates (latency, tone) are weighted by each session's interaction count;
// - the conflict baseline/after windows are reconstructed from each session's
//   stored rates (baseline window is always the fixed threshold size, so
//   conflicts = rate x threshold is exact) and re-divided, giving a genuine
//   pooled before/after rather than an average-of-rates.
// Nothing is invented: a session that never reached its baseline contributes
// nothing to the baseline windows, exactly as within a single session.
export const aggregateSessions = (history: ISessionMetrics[]): ISessionMetrics => {
  const empty: ISessionMetrics = {
    totalTokensUsed: 0, averageLatencyMs: 0, activeMemoryCount: 0, archivedMemoryCount: 0,
    interactionCount: 0, conflictCount: 0, conflictRate: 0, averageToneScore: 0,
    averageTokensPerInteraction: 0, baselineInteractionThreshold: 10,
    baselineConflictRate: null, postBaselineInteractionCount: 0, postBaselineConflictRate: null
  };
  if (history.length === 0) return empty;

  let totalTokens = 0, interactions = 0, conflicts = 0;
  let latencyWeighted = 0, toneWeighted = 0;
  let baselineTurns = 0, baselineConflicts = 0, afterTurns = 0, afterConflicts = 0;
  const threshold = history[0].baselineInteractionThreshold || 10;
  const cohorts = new Set<string>();

  for (const s of history) {
    totalTokens += s.totalTokensUsed;
    interactions += s.interactionCount;
    conflicts += s.conflictCount;
    latencyWeighted += s.averageLatencyMs * s.interactionCount;
    toneWeighted += s.averageToneScore * s.interactionCount;
    if (s.cohortId) cohorts.add(s.cohortId);

    if (s.baselineConflictRate !== null) {
      baselineTurns += threshold;
      baselineConflicts += Math.round(s.baselineConflictRate * threshold);
      if (s.postBaselineInteractionCount > 0 && s.postBaselineConflictRate !== null) {
        afterTurns += s.postBaselineInteractionCount;
        afterConflicts += Math.round(s.postBaselineConflictRate * s.postBaselineInteractionCount);
      }
    }
  }

  const last = history[history.length - 1];
  return {
    totalTokensUsed: totalTokens,
    averageLatencyMs: interactions === 0 ? 0 : Math.round(latencyWeighted / interactions),
    // Point-in-time distribution isn't additive; use the most recent session's.
    activeMemoryCount: last.activeMemoryCount,
    archivedMemoryCount: last.archivedMemoryCount,
    interactionCount: interactions,
    conflictCount: conflicts,
    conflictRate: interactions === 0 ? 0 : conflicts / interactions,
    averageToneScore: interactions === 0 ? 0 : toneWeighted / interactions,
    averageTokensPerInteraction: interactions === 0 ? 0 : Math.round(totalTokens / interactions),
    baselineInteractionThreshold: threshold,
    baselineConflictRate: baselineTurns === 0 ? null : baselineConflicts / baselineTurns,
    postBaselineInteractionCount: afterTurns,
    postBaselineConflictRate: afterTurns === 0 ? null : afterConflicts / afterTurns,
    cohortId: cohorts.size === 1 ? [...cohorts][0] : cohorts.size > 1 ? 'mixed' : undefined
  };
};

// Convenience wrapper: aggregate persisted history and render a pooled report,
// labelled with the real session count so it is never mistaken for one session.
export const generateAggregatePitchReport = (
  history: ISessionMetrics[],
  summary?: PitchSummary
): PitchReport =>
  generatePitchReport(
    aggregateSessions(history),
    summary,
    `${history.length} session(s) (aggregated observed telemetry)`
  );
