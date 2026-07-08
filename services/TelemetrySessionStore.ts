import { ISessionMetrics } from '../core/monitoring/TelemetryService';

const STORAGE_KEY = 'namo_telemetry_history_v1';
const MAX_SESSIONS = 200;

// A completed session's snapshot plus when it was captured, so a cross-session
// pitch report can order and label sessions.
export interface PersistedSession {
  capturedAt: number;
  metrics: ISessionMetrics;
}

// Persists ISessionMetrics history across browser sessions so a genuine,
// multi-session pitch report can be generated after live dogfooding. Kept as a
// separate adapter (not folded into TelemetryService) so the telemetry core
// stays a pure, dependency-free, unit-testable counter per CLAUDE.md section 6.
export interface TelemetrySessionStore {
  append(metrics: ISessionMetrics): void;
  loadHistory(): PersistedSession[];
  exportHistoryJson(): string;
  clear(): void;
}

// Guarded localStorage implementation -- same pattern as MemoryRepository /
// ABTestManager: never throws to the caller, flips to in-memory-only the first
// time storage is unavailable (private browsing, quota, enterprise policy).
export class LocalStorageTelemetrySessionStore implements TelemetrySessionStore {
  private storageKey: string;
  private history: PersistedSession[] = [];
  private storageAvailable = true;

  constructor(storageKey = STORAGE_KEY) {
    this.storageKey = storageKey;
    this.history = this.load();
  }

  append(metrics: ISessionMetrics): void {
    this.history.push({ capturedAt: Date.now(), metrics });
    if (this.history.length > MAX_SESSIONS) {
      this.history = this.history.slice(-MAX_SESSIONS);
    }
    this.persist();
  }

  loadHistory(): PersistedSession[] {
    return [...this.history];
  }

  exportHistoryJson(): string {
    return JSON.stringify(this.history, null, 2);
  }

  clear(): void {
    this.history = [];
    this.persist();
  }

  private load(): PersistedSession[] {
    if (typeof window === 'undefined' || !this.storageAvailable) return [];
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as PersistedSession[]) : [];
    } catch (error) {
      console.warn('TelemetrySessionStore: localStorage unavailable, in-memory only', error);
      this.storageAvailable = false;
      return [];
    }
  }

  private persist(): void {
    if (typeof window === 'undefined' || !this.storageAvailable) return;
    try {
      window.localStorage.setItem(this.storageKey, JSON.stringify(this.history));
    } catch (error) {
      console.warn('TelemetrySessionStore: failed to persist, in-memory only', error);
      this.storageAvailable = false;
    }
  }
}
