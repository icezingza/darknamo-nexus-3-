import { MemoryRecord, searchMemoryRecords } from '../core/domain/MemoryRecord';

describe('MemoryRecord lifecycle', () => {
  const make = (overrides = {}) =>
    new MemoryRecord({ id: 'a', content: 'hello world', emotionWeight: 0.5, timestamp: 1000, ...overrides });

  it('defaults to ACTIVE and mirrors timestamp into lastAccessed', () => {
    const r = make();
    expect(r.state).toBe('ACTIVE');
    expect(r.lastAccessed).toBe(1000);
  });

  it('clamps emotionWeight into [0, 1] on construction', () => {
    expect(make({ emotionWeight: 5 }).emotionWeight).toBe(1);
    expect(make({ emotionWeight: -3 }).emotionWeight).toBe(0);
  });

  it('archive() then forget() are order-independent terminal states', () => {
    const r = make();
    r.archive();
    expect(r.state).toBe('ARCHIVED');
    r.forget();
    expect(r.state).toBe('FORGOTTEN');
    // archive() must not resurrect a forgotten record
    r.archive();
    expect(r.state).toBe('FORGOTTEN');
  });

  it('reward is clamped to 1.0; penalty below 0.2 auto-archives', () => {
    const rewarded = make({ emotionWeight: 0.98 });
    rewarded.adjustEmotionWeight(0.05);
    expect(rewarded.emotionWeight).toBe(1);
    expect(rewarded.state).toBe('ACTIVE');

    const penalized = make({ emotionWeight: 0.3 });
    penalized.adjustEmotionWeight(-0.15); // -> 0.15, below 0.2 threshold
    expect(penalized.emotionWeight).toBeCloseTo(0.15);
    expect(penalized.state).toBe('ARCHIVED');
  });

  it('recordAccess updates lastAccessed', () => {
    const r = make();
    r.recordAccess(9999);
    expect(r.lastAccessed).toBe(9999);
  });

  it('toProps/fromProps round-trips including the embedding vector', () => {
    const r = make({ embedding: [0.1, 0.2, 0.3], state: 'ARCHIVED' });
    const clone = MemoryRecord.fromProps(r.toProps());
    expect(clone.embedding).toEqual([0.1, 0.2, 0.3]);
    expect(clone.state).toBe('ARCHIVED');
    expect(clone.id).toBe('a');
  });
});

describe('searchMemoryRecords (lexical Jaccard)', () => {
  const records = [
    new MemoryRecord({ id: '1', content: 'the cat sat on the mat', emotionWeight: 0.5, timestamp: 1 }),
    new MemoryRecord({ id: '2', content: 'a dog ran in the park', emotionWeight: 0.5, timestamp: 2 }),
    new MemoryRecord({ id: '3', content: 'cats and dogs', emotionWeight: 0.5, timestamp: 3 })
  ];

  it('returns records ordered by descending overlap, capped by limit', () => {
    const results = searchMemoryRecords(records, 'the cat', 2);
    expect(results.length).toBeLessThanOrEqual(2);
    expect(results[0].record.id).toBe('1');
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('returns [] for an empty query', () => {
    expect(searchMemoryRecords(records, '   ', 3)).toEqual([]);
  });
});
