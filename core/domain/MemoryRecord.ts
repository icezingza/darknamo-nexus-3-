export type MemoryLifecycleState = 'ACTIVE' | 'ARCHIVED' | 'FORGOTTEN';

export interface MemoryRecordProps {
  id: string;
  content: string;
  state?: MemoryLifecycleState;
  emotionWeight: number;
  timestamp: number;
  lastAccessed?: number;
  embedding?: number[];
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const LOW_WEIGHT_ARCHIVE_THRESHOLD = 0.2;

export class MemoryRecord {
  readonly id: string;
  readonly content: string;
  readonly timestamp: number;
  readonly embedding?: number[];
  state: MemoryLifecycleState;
  emotionWeight: number;
  lastAccessed: number;

  constructor(props: MemoryRecordProps) {
    this.id = props.id;
    this.content = props.content;
    this.timestamp = props.timestamp;
    this.embedding = props.embedding;
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

  adjustEmotionWeight(delta: number) {
    this.emotionWeight = clamp01(this.emotionWeight + delta);
    if (this.emotionWeight < LOW_WEIGHT_ARCHIVE_THRESHOLD) {
      this.archive();
    }
  }

  toProps(): MemoryRecordProps {
    return {
      id: this.id,
      content: this.content,
      state: this.state,
      emotionWeight: this.emotionWeight,
      timestamp: this.timestamp,
      lastAccessed: this.lastAccessed,
      embedding: this.embedding
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

// Pure math: cosine similarity of two equal-length vectors, in [-1, 1].
// Returns 0 for empty, length-mismatched, or zero-magnitude vectors so a
// bad/absent embedding simply ranks last instead of throwing.
export const calculateCosineSimilarity = (vecA: number[], vecB: number[]): number => {
  if (vecA.length === 0 || vecA.length !== vecB.length) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    magA += vecA[i] * vecA[i];
    magB += vecB[i] * vecB[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
};

// Pure ranking of ACTIVE records by cosine similarity to a query embedding.
// Records without an embedding are skipped rather than mis-ranked at 0.
export const searchSemanticMemories = (
  records: MemoryRecord[],
  queryEmbedding: number[],
  topK = 3
): MemorySearchResult[] => {
  if (queryEmbedding.length === 0) return [];

  return records
    .filter(record => record.state === 'ACTIVE' && record.embedding && record.embedding.length > 0)
    .map(record => ({
      record,
      score: calculateCosineSimilarity(queryEmbedding, record.embedding as number[])
    }))
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
};
