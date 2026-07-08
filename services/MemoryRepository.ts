import { MemoryRecord, MemoryRecordProps, searchMemoryRecords, searchSemanticMemories } from '../core/domain/MemoryRecord';

const STORAGE_KEY = 'namo_memory_records_v1';
const MAX_STORED_RECORDS = 300;
const MAX_ACTIVE_RESULTS = 3;
const MAX_CONTEXT_CHARS = 220;
const FLUSH_INTERVAL_MS = 1500;

export interface MemoryRepository {
  save(record: MemoryRecord): void;
  findActiveMemories(limit?: number): MemoryRecord[];
  searchActiveMemories(query: string, limit?: number): MemoryRecord[];
  searchArchivedMemories(query: string, limit?: number): MemoryRecord[];
  searchSemanticActiveMemories(queryEmbedding: number[], limit?: number): MemoryRecord[];
  buildSemanticContext(queryEmbedding: number[], limit?: number): string;
  archive(id: string): void;
  forget(id: string): void;
  adjustEmotionWeight(id: string, delta: number): void;
  countActiveMemories(): number;
  countArchivedMemories(): number;
  findHighValueMemories(minEmotionWeight: number): MemoryRecord[];
  buildContext(query: string, limit?: number): string;
  buildActiveContext(limit?: number): string;
  flush(force?: boolean): void;
  clear(): void;
}

export class LocalStorageMemoryRepository implements MemoryRepository {
  private records: MemoryRecord[] = [];
  private storageKey: string;
  private dirty = false;
  private lastFlush = 0;
  // Set false the first time localStorage throws (private browsing, enterprise
  // policy, quota, etc.) so we stop retrying it for the rest of the session.
  // `records` is the actual in-memory store either way — every read/write
  // method above operates on it directly, never on localStorage.
  private storageAvailable = true;

  constructor(storageKey = STORAGE_KEY) {
    this.storageKey = storageKey;
    this.records = this.load();
  }

  save(record: MemoryRecord) {
    const index = this.records.findIndex(existing => existing.id === record.id);
    if (index >= 0) {
      this.records[index] = record;
    } else {
      this.records.push(record);
    }
    this.trim();
    this.dirty = true;
  }

  findActiveMemories(limit = MAX_ACTIVE_RESULTS): MemoryRecord[] {
    return this.activeRecords()
      .sort((a, b) => b.lastAccessed - a.lastAccessed)
      .slice(0, limit);
  }

  searchActiveMemories(query: string, limit = MAX_ACTIVE_RESULTS): MemoryRecord[] {
    return searchMemoryRecords(this.activeRecords(), query, limit).map(result => result.record);
  }

  searchArchivedMemories(query: string, limit = MAX_ACTIVE_RESULTS): MemoryRecord[] {
    const archived = this.records.filter(record => record.state === 'ARCHIVED');
    return searchMemoryRecords(archived, query, limit).map(result => result.record);
  }

  searchSemanticActiveMemories(queryEmbedding: number[], limit = MAX_ACTIVE_RESULTS): MemoryRecord[] {
    // Domain function already restricts to ACTIVE + embedded records.
    return searchSemanticMemories(this.records, queryEmbedding, limit).map(result => result.record);
  }

  archive(id: string) {
    const record = this.records.find(existing => existing.id === id);
    if (!record) return;
    record.archive();
    this.dirty = true;
  }

  forget(id: string) {
    const record = this.records.find(existing => existing.id === id);
    if (!record) return;
    record.forget();
    this.dirty = true;
  }

  adjustEmotionWeight(id: string, delta: number) {
    const record = this.records.find(existing => existing.id === id);
    if (!record) return;
    record.adjustEmotionWeight(delta);
    this.dirty = true;
  }

  countActiveMemories(): number {
    return this.activeRecords().length;
  }

  countArchivedMemories(): number {
    return this.records.filter(record => record.state === 'ARCHIVED').length;
  }

  findHighValueMemories(minEmotionWeight: number): MemoryRecord[] {
    return this.records.filter(
      record => record.state !== 'FORGOTTEN' && record.emotionWeight > minEmotionWeight
    );
  }

  buildContext(query: string, limit = MAX_ACTIVE_RESULTS): string {
    return this.formatContext('Relevant memory', this.searchActiveMemories(query, limit));
  }

  buildActiveContext(limit = MAX_ACTIVE_RESULTS): string {
    return this.formatContext('Active memory', this.findActiveMemories(limit));
  }

  buildSemanticContext(queryEmbedding: number[], limit = MAX_ACTIVE_RESULTS): string {
    return this.formatContext('Relevant memory', this.searchSemanticActiveMemories(queryEmbedding, limit));
  }

  flush(force = false) {
    if (!this.dirty && !force) return;
    if (!force && Date.now() - this.lastFlush < FLUSH_INTERVAL_MS) return;
    this.persist();
    this.lastFlush = Date.now();
    this.dirty = false;
  }

  clear() {
    this.records = [];
    this.dirty = false;
    this.persist();
  }

  private activeRecords() {
    return this.records.filter(record => record.state === 'ACTIVE');
  }

  private load(): MemoryRecord[] {
    if (typeof window === 'undefined' || !this.storageAvailable) return [];
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as MemoryRecordProps[];
      return Array.isArray(parsed) ? parsed.map(MemoryRecord.fromProps) : [];
    } catch (error) {
      console.warn('MemoryRepository: localStorage unavailable, falling back to in-memory only', error);
      this.storageAvailable = false;
      return [];
    }
  }

  private persist() {
    if (typeof window === 'undefined' || !this.storageAvailable) return;
    this.records = this.records.filter(record => record.state !== 'FORGOTTEN');
    try {
      window.localStorage.setItem(
        this.storageKey,
        JSON.stringify(this.records.map(record => record.toProps()))
      );
    } catch (error) {
      console.warn('MemoryRepository: failed to persist to localStorage, continuing in-memory only', error);
      this.storageAvailable = false;
    }
  }

  private trim() {
    if (this.records.length <= MAX_STORED_RECORDS) return;
    this.records = this.records.slice(-MAX_STORED_RECORDS);
  }

  private truncate(text: string) {
    if (text.length <= MAX_CONTEXT_CHARS) return text;
    return `${text.slice(0, MAX_CONTEXT_CHARS)}...`;
  }

  private formatContext(label: string, records: MemoryRecord[]) {
    if (records.length === 0) return '';
    const lines = records.map(record => `- ${this.truncate(record.content)}`);
    return `${label}:\n${lines.join('\n')}`;
  }
}
