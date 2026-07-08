import {
  MemoryRecord,
  calculateCosineSimilarity,
  searchSemanticMemories
} from '../core/domain/MemoryRecord';

describe('calculateCosineSimilarity', () => {
  it('is 1 for identical direction vectors', () => {
    expect(calculateCosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    expect(calculateCosineSimilarity([1, 0], [2, 0])).toBeCloseTo(1);
  });

  it('is 0 for orthogonal vectors', () => {
    expect(calculateCosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('is -1 for opposite vectors', () => {
    expect(calculateCosineSimilarity([1, 2], [-1, -2])).toBeCloseTo(-1);
  });

  it('returns 0 (never NaN/throw) for empty, mismatched, or zero-magnitude input', () => {
    expect(calculateCosineSimilarity([], [])).toBe(0);
    expect(calculateCosineSimilarity([1, 2], [1])).toBe(0);
    expect(calculateCosineSimilarity([0, 0], [1, 2])).toBe(0);
  });
});

describe('searchSemanticMemories', () => {
  const build = () => [
    new MemoryRecord({ id: 'near', content: 'near', emotionWeight: 0.5, timestamp: 1, embedding: [1, 0, 0] }),
    new MemoryRecord({ id: 'mid', content: 'mid', emotionWeight: 0.5, timestamp: 2, embedding: [0.7, 0.7, 0] }),
    new MemoryRecord({ id: 'far', content: 'far', emotionWeight: 0.5, timestamp: 3, embedding: [0, 1, 0] })
  ];

  it('ranks ACTIVE embedded records by cosine similarity to the query', () => {
    const results = searchSemanticMemories(build(), [1, 0, 0], 3);
    expect(results.map(r => r.record.id)).toEqual(['near', 'mid']); // 'far' scores 0 and is dropped
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('respects topK', () => {
    expect(searchSemanticMemories(build(), [1, 1, 0], 1).length).toBe(1);
  });

  it('excludes non-ACTIVE and unembedded records', () => {
    const records = build();
    records[0].archive(); // 'near' now ARCHIVED
    const noVec = new MemoryRecord({ id: 'novec', content: 'x', emotionWeight: 0.5, timestamp: 4 });
    const results = searchSemanticMemories([...records, noVec], [1, 0, 0], 5);
    const ids = results.map(r => r.record.id);
    expect(ids).not.toContain('near');
    expect(ids).not.toContain('novec');
  });

  it('returns [] for an empty query embedding', () => {
    expect(searchSemanticMemories(build(), [], 3)).toEqual([]);
  });
});
