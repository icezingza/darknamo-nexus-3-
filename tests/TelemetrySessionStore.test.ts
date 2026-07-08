import { LocalStorageTelemetrySessionStore } from '../services/TelemetrySessionStore';
import { ISessionMetrics } from '../core/monitoring/TelemetryService';

// Runs fully in-memory under Node: the store's window/localStorage access is
// guarded, so there is no persistence layer to stub here.
const metrics = (interactionCount: number): ISessionMetrics => ({
  totalTokensUsed: interactionCount * 100,
  averageLatencyMs: 500,
  activeMemoryCount: 0,
  archivedMemoryCount: 0,
  interactionCount,
  conflictCount: 0,
  conflictRate: 0,
  averageToneScore: 0.8,
  averageTokensPerInteraction: 100,
  baselineInteractionThreshold: 10,
  baselineConflictRate: null,
  postBaselineInteractionCount: 0,
  postBaselineConflictRate: null
});

describe('LocalStorageTelemetrySessionStore', () => {
  it('appends distinct sessions', () => {
    const store = new LocalStorageTelemetrySessionStore('test_key_1');
    store.append(metrics(3), 'sess-a');
    store.append(metrics(5), 'sess-b');
    expect(store.loadHistory().length).toBe(2);
  });

  it('overwrites (does not duplicate) an entry with the same sessionId', () => {
    const store = new LocalStorageTelemetrySessionStore('test_key_2');
    store.append(metrics(3), 'sess-a'); // early export, 3 turns
    store.append(metrics(8), 'sess-a'); // later export of the SAME session, 8 turns
    const history = store.loadHistory();
    expect(history.length).toBe(1);
    expect(history[0].metrics.interactionCount).toBe(8); // latest snapshot wins
  });

  it('always appends when no sessionId is supplied', () => {
    const store = new LocalStorageTelemetrySessionStore('test_key_3');
    store.append(metrics(1));
    store.append(metrics(1));
    expect(store.loadHistory().length).toBe(2);
  });
});
