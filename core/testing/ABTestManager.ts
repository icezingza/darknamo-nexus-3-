export type Cohort = 'control' | 'variant';

const STORAGE_KEY = 'namo_ab_cohort_v1';

export interface ABTestManagerOptions {
  sessionId?: string;
  storageKey?: string;
}

const hashToCohort = (value: string): Cohort => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 2 === 0 ? 'control' : 'variant';
};

export class ABTestManager {
  private readonly cohort: Cohort;
  private readonly storageKey: string;

  constructor(options: ABTestManagerOptions = {}) {
    this.storageKey = options.storageKey ?? STORAGE_KEY;
    this.cohort = this.resolveCohort(options.sessionId);
  }

  getCohort(): Cohort {
    return this.cohort;
  }

  private resolveCohort(sessionId?: string): Cohort {
    const stored = this.loadStoredCohort();
    if (stored) return stored;

    const cohort = sessionId ? hashToCohort(sessionId) : (Math.random() < 0.5 ? 'control' : 'variant');
    this.persistCohort(cohort);
    return cohort;
  }

  private loadStoredCohort(): Cohort | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      return raw === 'control' || raw === 'variant' ? raw : null;
    } catch {
      return null;
    }
  }

  private persistCohort(cohort: Cohort): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(this.storageKey, cohort);
    } catch {
      // Storage may be blocked (private browsing, enterprise policy); fail silently.
    }
  }
}
