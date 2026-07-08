import { TelemetryService } from '../core/monitoring/TelemetryService';
import { aggregateSessions, generateAggregatePitchReport } from '../scripts/generatePitchReport';

const conflict = { toneScore: 0.5, conflictLevel: 1 };
const calm = { toneScore: 0.9, conflictLevel: 0 };

describe('TelemetryService counting', () => {
  it('sums token usage and averages latency', () => {
    const t = new TelemetryService();
    t.recordTokenUsage(100);
    t.recordTokenUsage(50);
    t.recordLatency(200);
    t.recordLatency(400);
    const s = t.getSnapshot();
    expect(s.totalTokensUsed).toBe(150);
    expect(s.averageLatencyMs).toBe(300);
  });

  it('counts interactions/conflicts and derives rate + tone average', () => {
    const t = new TelemetryService();
    t.recordEvolutionMetrics(conflict);
    t.recordEvolutionMetrics(calm);
    t.recordEvolutionMetrics(calm);
    const s = t.getSnapshot();
    expect(s.interactionCount).toBe(3);
    expect(s.conflictCount).toBe(1);
    expect(s.conflictRate).toBeCloseTo(1 / 3);
    expect(s.averageToneScore).toBeCloseTo((0.5 + 0.9 + 0.9) / 3);
  });

  it('ignores payloads without numeric tone/conflict (no NaN poisoning)', () => {
    const t = new TelemetryService();
    t.recordEvolutionMetrics({ irrelevant: 'x' });
    t.recordEvolutionMetrics({ toneScore: 'bad', conflictLevel: 1 } as never);
    const s = t.getSnapshot();
    expect(s.interactionCount).toBe(0);
    expect(Number.isNaN(s.averageToneScore)).toBe(false);
  });

  it('derives averageTokensPerInteraction from real counters', () => {
    const t = new TelemetryService();
    t.recordTokenUsage(300);
    t.recordEvolutionMetrics(calm);
    t.recordEvolutionMetrics(calm);
    expect(t.getSnapshot().averageTokensPerInteraction).toBe(150);
  });
});

describe('TelemetryService baseline / disjoint after-window', () => {
  it('leaves baseline null until the threshold is reached', () => {
    const t = new TelemetryService();
    for (let i = 0; i < 9; i++) t.recordEvolutionMetrics(conflict);
    const s = t.getSnapshot();
    expect(s.baselineConflictRate).toBeNull();
    expect(s.postBaselineConflictRate).toBeNull();
  });

  it('freezes the baseline at N turns and accrues later turns to a disjoint window', () => {
    const t = new TelemetryService();
    for (let i = 0; i < 10; i++) t.recordEvolutionMetrics(conflict); // baseline 10/10 = 1.0
    for (let i = 0; i < 8; i++) t.recordEvolutionMetrics(calm); // after 0/8 = 0
    const s = t.getSnapshot();
    expect(s.baselineConflictRate).toBeCloseTo(1);
    expect(s.postBaselineInteractionCount).toBe(8);
    expect(s.postBaselineConflictRate).toBeCloseTo(0);
    expect(s.interactionCount).toBe(18); // windows are disjoint but total is the sum
  });
});

describe('aggregateSessions (cross-session roll-up)', () => {
  it('returns an all-zero/null aggregate for empty history', () => {
    const agg = aggregateSessions([]);
    expect(agg.interactionCount).toBe(0);
    expect(agg.baselineConflictRate).toBeNull();
  });

  it('pools additive counters and reconstructs a genuine pooled baseline', () => {
    // Session A: baseline 1.0 (10/10), after 0.0 (0/8)
    const a = new TelemetryService();
    for (let i = 0; i < 10; i++) a.recordEvolutionMetrics(conflict);
    for (let i = 0; i < 8; i++) a.recordEvolutionMetrics(calm);
    // Session B: baseline 0.0 (0/10), after 0.0 (0/4)
    const b = new TelemetryService();
    for (let i = 0; i < 14; i++) b.recordEvolutionMetrics(calm);

    const agg = aggregateSessions([a.getSnapshot(), b.getSnapshot()]);
    expect(agg.interactionCount).toBe(32);
    // pooled baseline: (10 conflicts) / (20 baseline turns) = 0.5
    expect(agg.baselineConflictRate).toBeCloseTo(0.5);
    // pooled after: 0 conflicts / 12 after-turns = 0
    expect(agg.postBaselineConflictRate).toBeCloseTo(0);

    const report = generateAggregatePitchReport([a.getSnapshot(), b.getSnapshot()]);
    expect(report.scope).toContain('2 session');
    expect(report.conflictReduction.status).toBe('ok');
    expect(report.conflictReduction.reductionPct).toBeCloseTo(100);
  });
});
