
export type MemoryRole = 'user' | 'model';

export interface MemoryItem {
  id: string;
  role: MemoryRole;
  text: string;
  timestamp: number;
  tags?: string[];
}

export interface MemorySearchResult {
  item: MemoryItem;
  score: number;
}

const STORAGE_KEY = 'namo_vector_memory_v1';
const MAX_ITEMS = 300;
const MAX_CONTEXT_CHARS = 220;

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

export class LocalVectorMemory {
  private items: MemoryItem[] = [];
  private dirty = false;
  private lastFlush = 0;
  private storageKey: string;

  constructor(storageKey = STORAGE_KEY) {
    this.storageKey = storageKey;
    this.items = this.load();
  }

  add(item: MemoryItem) {
    this.items.push(item);
    this.trim();
    this.dirty = true;
  }

  search(query: string, limit = 3): MemorySearchResult[] {
    const queryTokens = tokenize(query);
    if (queryTokens.size === 0) return [];

    return this.items
      .map(item => ({
        item,
        score: jaccardSimilarity(queryTokens, tokenize(item.text))
      }))
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  buildContext(query: string, limit = 3) {
    const results = this.search(query, limit);
    if (results.length === 0) return '';

    const lines = results.map(result => `- (${result.item.role}) ${this.truncate(result.item.text)}`);
    return `Relevant memory:\n${lines.join('\n')}`;
  }

  flush(force = false) {
    if (!this.dirty && !force) return;
    if (!force && Date.now() - this.lastFlush < 1500) return;
    this.persist(this.items);
    this.lastFlush = Date.now();
    this.dirty = false;
  }

  clear() {
    this.items = [];
    this.dirty = false;
    this.persist(this.items);
  }

  private load(): MemoryItem[] {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(this.storageKey);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as MemoryItem[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private persist(items: MemoryItem[]) {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(this.storageKey, JSON.stringify(items));
  }

  private trim() {
    if (this.items.length <= MAX_ITEMS) return;
    this.items = this.items.slice(-MAX_ITEMS);
  }

  private truncate(text: string) {
    if (text.length <= MAX_CONTEXT_CHARS) return text;
    return `${text.slice(0, MAX_CONTEXT_CHARS)}...`;
  }
}
