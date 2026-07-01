export type MemoryLifecycleState = 'ACTIVE' | 'ARCHIVED' | 'FORGOTTEN';

export interface MemoryRecordProps {
  id: string;
  content: string;
  state?: MemoryLifecycleState;
  emotionWeight: number;
  timestamp: number;
  lastAccessed?: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export class MemoryRecord {
  readonly id: string;
  readonly content: string;
  readonly timestamp: number;
  state: MemoryLifecycleState;
  emotionWeight: number;
  lastAccessed: number;

  constructor(props: MemoryRecordProps) {
    this.id = props.id;
    this.content = props.content;
    this.timestamp = props.timestamp;
    this.state = props.state ?? 'ACTIVE';
    this.emotionWeight = clamp01(props.emotionWeight);
    this.lastAccessed = props.lastAccessed ?? props.timestamp;
  }

  archive() {
    if (this.state === 'FORGOTTEN') return;
    this.state = 'ARCHIVED';
  }

  forget() {
    this.state = 'FORGOTTEN';
  }

  recordAccess(at: number = Date.now()) {
    this.lastAccessed = at;
  }

  toProps(): MemoryRecordProps {
    return {
      id: this.id,
      content: this.content,
      state: this.state,
      emotionWeight: this.emotionWeight,
      timestamp: this.timestamp,
      lastAccessed: this.lastAccessed
    };
  }

  static fromProps(props: MemoryRecordProps): MemoryRecord {
    return new MemoryRecord(props);
  }
}

export interface MemorySearchResult {
  record: MemoryRecord;
  score: number;
}

const normalizeText = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\u0e00-\u0e7f\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (text: string) => new Set(normalizeText(text).split(' ').filter(Boolean));

const jaccardSimilarity = (a: Set<string>, b: Set<string>) => {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

export const searchMemoryRecords = (
  records: MemoryRecord[],
  query: string,
  limit = 3
): MemorySearchResult[] => {
  const queryTokens = tokenize(query);
  if (queryTokens.size === 0) return [];

  return records
    .map(record => ({ record, score: jaccardSimilarity(queryTokens, tokenize(record.content)) }))
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
};
