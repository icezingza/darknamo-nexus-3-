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
    // Observed, not "reduced from a baseline" -- there is no baseline stored.
    observedConflictRate: number;
    conflictInteractions: number;
    averageToneScore: number;
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
  'All figures are observed counters from one live session. They are NOT aggregate, ' +
  'benchmarked, or validated production metrics, and contain no projected or baseline-relative claims.';

// Pure: snapshot in, report out. Injectable for tests and callable from either
// the UI (live snapshot) or a Node context (snapshot loaded from a file).
export const generatePitchReport = (
  snapshot: ISessionMetrics,
  summary?: PitchSummary
): PitchReport => {
  const report: PitchReport = {
    generatedAt: new Date().toISOString(),
    scope: SCOPE,
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
    }
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
