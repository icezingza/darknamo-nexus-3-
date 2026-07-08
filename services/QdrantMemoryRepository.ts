import { QdrantClient } from '@qdrant/js-client-rest';
import { MemoryRecord } from '../core/domain/MemoryRecord';
import { MemoryRepository, LocalStorageMemoryRepository } from './MemoryRepository';

const COLLECTION_NAME = 'namo_memories';
const VECTOR_SIZE = 768;

// All sync MemoryRepository methods delegate to LocalStorageMemoryRepository so
// the full CRUD contract is always satisfied regardless of Qdrant availability.
// Qdrant receives fire-and-forget async upserts on save/forget, giving the app
// a cloud-backed vector store that survives localStorage clearing at scale.
// If Qdrant is unreachable or credentials are absent, `available` stays false
// and the repo silently operates as a pure local-storage store — no exception
// ever surfaces to the caller from the async Qdrant path.
export class QdrantMemoryRepository implements MemoryRepository {
  private client: QdrantClient | null = null;
  private local: LocalStorageMemoryRepository;
  private available = false;
  // Resolves once the collection health-check completes (either way).
  private ready: Promise<void>;

  constructor(local: LocalStorageMemoryRepository) {
    this.local = local;

    const url = (import.meta as Record<string, any>).env?.VITE_QDRANT_URL as string | undefined;
    const apiKey = (import.meta as Record<string, any>).env?.VITE_QDRANT_API_KEY as string | undefined;

    if (url && apiKey) {
      this.client = new QdrantClient({ url, apiKey });
      this.ready = this.initCollection();
    } else {
      this.ready = Promise.resolve();
    }
  }

  // ── sync MemoryRepository interface — all via local ─────────────────────────

  save(record: MemoryRecord): void {
    this.local.save(record);
    // Best-effort async upsert; never awaited, never throws back to caller.
    if (record.embedding && record.embedding.length > 0) {
      this.upsert(record).catch(() => { /* swallowed */ });
    }
  }

  findActiveMemories(limit?: number): MemoryRecord[] {
    return this.local.findActiveMemories(limit);
  }

  searchActiveMemories(query: string, limit?: number): MemoryRecord[] {
    return this.local.searchActiveMemories(query, limit);
  }

  searchArchivedMemories(query: string, limit?: number): MemoryRecord[] {
    return this.local.searchArchivedMemories(query, limit);
  }

  searchSemanticActiveMemories(queryEmbedding: number[], limit?: number): MemoryRecord[] {
    // Sync path: in-memory cosine via domain function (same as LocalStorageMemoryRepository).
    // For the async Qdrant-backed path, callers can use searchQdrantSemantic().
    return this.local.searchSemanticActiveMemories(queryEmbedding, limit);
  }

  buildSemanticContext(queryEmbedding: number[], limit?: number): string {
    return this.local.buildSemanticContext(queryEmbedding, limit);
  }

  buildContext(query: string, limit?: number): string {
    return this.local.buildContext(query, limit);
  }

  buildActiveContext(limit?: number): string {
    return this.local.buildActiveContext(limit);
  }

  archive(id: string): void {
    this.local.archive(id);
    // Update payload in Qdrant so future searches can filter by state.
    this.setPayloadField(id, 'state', 'ARCHIVED').catch(() => { /* swallowed */ });
  }

  forget(id: string): void {
    this.local.forget(id);
    // FORGOTTEN records are dropped from persistence — remove from Qdrant too.
    this.deletePoint(id).catch(() => { /* swallowed */ });
  }

  adjustEmotionWeight(id: string, delta: number): void {
    this.local.adjustEmotionWeight(id, delta);
  }

  countActiveMemories(): number {
    return this.local.countActiveMemories();
  }

  countArchivedMemories(): number {
    return this.local.countArchivedMemories();
  }

  findHighValueMemories(minEmotionWeight: number): MemoryRecord[] {
    return this.local.findHighValueMemories(minEmotionWeight);
  }

  flush(force?: boolean): void {
    this.local.flush(force);
  }

  clear(): void {
    this.local.clear();
    this.deleteAll().catch(() => { /* swallowed */ });
  }

  // ── async Qdrant-specific search ─────────────────────────────────────────────

  // Callers (e.g. App.tsx via instanceof check) can use this to get cloud-backed
  // ANN results. Falls back gracefully to the sync local path on failure.
  async searchQdrantSemantic(queryEmbedding: number[], limit = 3): Promise<MemoryRecord[]> {
    await this.ready;
    if (!this.available || !this.client || queryEmbedding.length === 0) {
      return this.local.searchSemanticActiveMemories(queryEmbedding, limit);
    }
    try {
      const results = await this.client.search(COLLECTION_NAME, {
        vector: queryEmbedding,
        limit,
        with_payload: true,
        filter: {
          must: [{ key: 'state', match: { value: 'ACTIVE' } }]
        }
      });

      // Re-fetch full MemoryRecord from local store so callers always get
      // live objects (with current emotionWeight, lastAccessed, etc.).
      const localAll = this.local.findActiveMemories(9999);
      const localById = new Map(localAll.map(r => [r.id, r]));

      return results
        .map(hit => localById.get(hit.id as string))
        .filter((r): r is MemoryRecord => r !== undefined);
    } catch (err) {
      console.warn('QdrantMemoryRepository: search failed, falling back to local', err);
      return this.local.searchSemanticActiveMemories(queryEmbedding, limit);
    }
  }

  get isQdrantAvailable(): boolean {
    return this.available;
  }

  // ── private Qdrant helpers ────────────────────────────────────────────────────

  private async initCollection(): Promise<void> {
    if (!this.client) return;
    try {
      const { collections } = await this.client.getCollections();
      const exists = collections.some(c => c.name === COLLECTION_NAME);
      if (!exists) {
        await this.client.createCollection(COLLECTION_NAME, {
          vectors: { size: VECTOR_SIZE, distance: 'Cosine' }
        });
      }
      this.available = true;
    } catch (err) {
      console.warn('QdrantMemoryRepository: Qdrant unreachable — semantic search will use in-memory fallback', err);
      this.available = false;
    }
  }

  private async upsert(record: MemoryRecord): Promise<void> {
    await this.ready;
    if (!this.available || !this.client || !record.embedding) return;
    await this.client.upsert(COLLECTION_NAME, {
      wait: false,
      points: [{
        id: record.id,
        vector: record.embedding,
        payload: {
          content: record.content,
          state: record.state,
          emotionWeight: record.emotionWeight,
          timestamp: record.timestamp,
          lastAccessed: record.lastAccessed
        }
      }]
    });
  }

  private async setPayloadField(id: string, key: string, value: unknown): Promise<void> {
    await this.ready;
    if (!this.available || !this.client) return;
    await this.client.setPayload(COLLECTION_NAME, {
      payload: { [key]: value },
      points: [id]
    });
  }

  private async deletePoint(id: string): Promise<void> {
    await this.ready;
    if (!this.available || !this.client) return;
    await this.client.delete(COLLECTION_NAME, { points: [id] });
  }

  private async deleteAll(): Promise<void> {
    await this.ready;
    if (!this.available || !this.client) return;
    await this.client.deleteCollection(COLLECTION_NAME);
    // Re-create empty collection so future saves have somewhere to go.
    await this.initCollection();
  }
}
