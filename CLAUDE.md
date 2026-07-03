# Namo Genesis v2.1 — Engineering Guide

## Scope

This file currently governs ten subsystems: **Emotion**, **Memory**,
**Token Budgeting**, **Identity**, **Evolution**, **Monitoring**,
**Experimentation**, **Data Export**, **Model Providers**, and
**Cognition**. It reflects what is actually wired into the app
(`App.tsx` → `core/providers/`). The
former `system_core/` and `scenarios/` directories contained orphaned
bypass modules (never imported by the live pipeline) and have been
removed; do not reintroduce safety-bypass or persona-override modules of
that kind.

## 1. Emotion

- Live signal today comes from `core/Unified_Moral_Layer.ts`. The raw
  detection (`evaluateMoralSignals` → `{ tone, hasRisk }`) is the single
  source of truth; `buildMoralContext` formats it into prompt text, and
  `core/evolution/EvolutionEngine.ts` (section 5) consumes the same raw
  signals for a different purpose (weighting), rather than re-deriving
  them from keyword lists a second time. `core/Subliminal_Processor.ts` is
  imported in `App.tsx` but is currently unused in the live pipeline, and
  `core/Emotional_Engine.ts` exists only as an unimported draft.
- Model emotion as a plain numeric affect vector (e.g. valence, arousal,
  trust, dominance), computed as a pure function of conversation signals.
  No LLM call, no DOM/network access — this must be unit-testable in
  isolation.
- Domain layer: `core/emotion/EmotionEngine.ts` implements this as
  `IAffectVector` (`valence`, `arousal`, `trust`, `passion`, `resonance`,
  each `0..1`) with pure `updateAffect(state, signals)` /
  `applyDecay(state)` functions (plus a thin `EmotionEngine` class
  wrapper). `updateAffect` blends the prior state with the signal-implied
  target under a 0.7 inertia weight so a single turn can't swing the mood;
  `applyDecay` relaxes `arousal`/`passion` toward the `0.5` baseline each
  turn while leaving `trust`/`valence`/`resonance` sticky. Keep this layer
  free of storage/DOM/LLM access — it must stay unit-testable in isolation.
- Wiring: `App.tsx` holds `affectState` in React state (seeded from
  `emotionEngine.createInitialAffect()`) and advances it **synchronously**
  in `handleSendMessage`, right after this turn's `IEvaluationMetrics` is
  derived — running `updateAffect` then `applyDecay` on that turn's
  `toneScore`/`conflictLevel` via a functional `setAffectState(prev => …)`
  updater. It is intentionally *not* placed in the Evolution engine's
  deferred `.then()` block (section 5): the affect update depends only on
  the already-computed metrics, so doing it synchronously keeps mood
  updates in message order and prevents an `evaluateInteraction` rejection
  from freezing the affect state. `components/EmotionDashboard.tsx` is a
  pure presentation component that renders the vector as bars (guarding
  against a missing vector); it never computes affect itself.
- Keep affect *state* separate from prompt *vocabulary*. State is data
  (`{ valence: number, arousal: number, ... }`); how that state phrases a
  reply belongs in the prompt-construction layer, not hardcoded into named
  "modes."

## 2. Memory (DDD lifecycle)

- Live implementation:
  - Domain layer: `core/domain/MemoryRecord.ts` — `MemoryRecord` (fields:
    `id`, `content`, `state: 'ACTIVE' | 'ARCHIVED' | 'FORGOTTEN'`,
    `emotionWeight`, `timestamp`, `lastAccessed`, optional
    `embedding?: number[]`) with lifecycle methods `archive()`,
    `forget()`, `recordAccess()`, plus two pure ranking functions:
    `searchMemoryRecords` (lexical Jaccard) and `searchSemanticMemories`
    (cosine similarity over `embedding`, via the pure
    `calculateCosineSimilarity`, restricted to ACTIVE + embedded records).
    The math stays here — **no** LLM/API call in the domain layer; the
    embedding *vectors* are computed by the provider (section 9) and
    passed in. No `window`/`localStorage` import here.
  - Infrastructure layer: `services/MemoryRepository.ts` —
    `MemoryRepository` interface implemented by
    `LocalStorageMemoryRepository`, persisting to `localStorage` with
    `flush`/`trim` housekeeping. Keep it swappable — the domain code does
    not care where records are persisted.
  - `records: MemoryRecord[]` is the actual in-memory store; every
    read/write method operates on it directly, `localStorage` is only
    touched by `load()`/`persist()` as a disk-sync layer. Both are
    wrapped in try/catch — if `localStorage` throws (private browsing,
    enterprise policy, quota), `storageAvailable` flips to `false` so we
    stop retrying it, but the session keeps working entirely in-memory
    for its duration; it just won't survive a page refresh.
- `findActiveMemories`/`searchActiveMemories` only consider `ACTIVE`
  records and are capped (default 3) so injected context stays bounded —
  this cap is the first line of defense against context overflow, on top
  of the `TokenBudget` gate in section 3.
- Semantic retrieval: `App.tsx` embeds the user's query once per turn (via
  `IModelProvider.generateEmbedding`, section 9) and calls
  `MemoryRepository.buildSemanticContext(queryEmbedding, 3)`
  (→ `searchSemanticActiveMemories` → domain `searchSemanticMemories`).
  The same query vector is reused as the stored `embedding` of the saved
  user memory; the model response is embedded before its own save.
  Embedding is best-effort: `App.tsx`'s `safeEmbed` swallows failures and
  returns `undefined`, so a failed embed falls back to recency
  (`buildActiveContext`) for retrieval and saves the record with no
  vector (searchable lexically, just not semantically). The Jaccard path
  is retained, not removed.
- `ARCHIVED` items are excluded from active search by default (reachable
  only via `searchArchivedMemories`); `FORGOTTEN` items are dropped from
  persistence entirely on the next `flush()`.

## 3. Token Budgeting

- Live implementation: `core/Token_Budget.ts` (`TokenBudget`) — heuristic
  `length / 4` estimate, checked against `maxTokens` with reserved output
  headroom, gating every model call from `App.tsx`.
- Rule: any new context injected into a prompt (memory search results,
  moral-layer context, future additions) must be counted through
  `estimateTokens`/`estimateMessages` *before* it's appended — never append
  ungated context that bypasses the budget check.
- Do not remove or weaken the `TokenBudget` gate to "make room" for a
  feature; shrink the feature's context footprint instead.

## 4. Identity

- Live implementation: `core/identity/IdentityCapsule.ts` (`IdentityCapsule`)
  — a model-agnostic persona container built from an `IIdentityBlueprint`
  (four plain string-array fields: `purpose`, `cognitiveStyle`,
  `emotionalPosture`, `ethicalConstraints`). `core/identity/NamoIdentity.ts`
  holds the concrete NaMo persona data (restructured, content-equivalent,
  from the old `constants.ts` monolithic prompt string, which has been
  removed).
- Two output formatters, two different cadences:
  - `getSystemContext()` — full bullet-list rendering, passed once into
    the active `IModelProvider`'s constructor (section 9, e.g.
    `GeminiProvider`) as `systemContext`, set as the Gemini
    `systemInstruction` at session creation. This is the "Load the
    Identity" step, done once per session rather than resent per turn, to
    keep token usage bounded per rule 3.
  - `getDistilledContext(currentEmotion, cohort)` — a single-line,
    label-free compression of the same four fields plus the current
    per-turn emotion/Dharma read (`buildMoralContext`'s output). Called
    every turn in `App.tsx` and folded into the per-message context block
    alongside active memories, so the model gets a lightweight
    persona+mood reminder without repeating the full `getSystemContext()`
    block. `cohort` (from `ABTestManager`, section 7) trims
    `cognitiveStyle`/`emotionalPosture` for `'variant'` sessions to test
    token savings — `purpose` and `ethicalConstraints` are never dropped
    by a cohort, in either arm.
- Do not hardcode a new monolithic prompt string anywhere in `App.tsx` or
  `services/*`; persona changes go through `IdentityCapsule`/`IIdentityBlueprint`
  fields.
- `IdentityCapsule` must stay pure data + string formatting — no LLM call,
  no DOM/network/storage access, so it stays unit-testable in isolation.

## 5. Evolution (memory weight adjustment)

- Live implementation: `core/evolution/EvolutionEngine.ts` (`EvolutionEngine`)
  — takes a `MemoryRepository` via constructor injection (no global
  access), and `evaluateInteraction(memoryIds, metrics: IEvaluationMetrics)`
  adjusts the `emotionWeight` of the given memory records:
  - High `conflictLevel` (>= 0.5) → penalize (`-0.15`); if the resulting
    weight drops below `MemoryRecord`'s internal archive threshold
    (`0.2`), the record auto-archives via its own `archive()` method —
    this invariant lives in the domain object (`MemoryRecord.adjustEmotionWeight`),
    not in the engine, so it holds regardless of caller.
  - High `toneScore` (>= 0.7) with low conflict → reward (`+0.05`), clamped
    to `1.0` by the same domain method.
  - Otherwise: no-op.
- `deriveEvaluationMetrics` maps `MoralSignals` (from
  `core/Unified_Moral_Layer.ts`, see section 1) onto `IEvaluationMetrics`
  — this is the only place that translates tone/risk into
  toneScore/conflictLevel, so it doesn't need to be re-derived at the
  call site.
- `App.tsx` calls `evaluateInteraction` after saving the model's response
  to memory, without `await`-ing it — chained with `.then()`/`.catch()`
  instead (the `.then()` handles the gated `flush()` and telemetry
  recording, the `.catch()` logs rather than lets a rejection go
  unhandled) — so it never blocks the UI response thread.
  `evaluateInteraction` itself yields to the event loop
  (`await Promise.resolve()`) before doing any work, so it runs after
  the current task rather than inline.
- `EvolutionEngine` must stay swappable/testable: only talk to
  `MemoryRepository` through its public interface, never reach into
  `MemoryRecord` internals directly.
- `EvolutionEngine` must not force persistence itself (no `flush()` calls
  inside it) — that decision belongs to the caller, which knows the
  user's `autoSaveEnabled` preference; a domain/application service
  should not silently override it.

## 6. Monitoring (telemetry)

- Live implementation: `core/monitoring/TelemetryService.ts`
  (`TelemetryService`) — tracks `ISessionMetrics` (`totalTokensUsed`,
  `averageLatencyMs`, `activeMemoryCount`, `archivedMemoryCount`, plus the
  observed aggregates `interactionCount`, `conflictCount`, `conflictRate`,
  `averageToneScore`, `averageTokensPerInteraction`) and exposes
  `recordTokenUsage`, `recordLatency`, `recordMemoryDistribution`,
  `recordEvolutionMetrics`, and `getSnapshot()`. No constructor
  dependencies — plain in-memory counters, unit-testable in isolation.
- The tone/conflict aggregates are folded in by `recordEvolutionMetrics`
  from the per-turn `toneScore`/`conflictLevel` the Evolution engine
  already emits (guarded by `typeof === 'number'` so an unrelated payload
  can't poison the running averages with `NaN`). Conflict is counted at
  the same `>= 0.5` threshold the Evolution engine penalizes at, so the
  observed rate lines up with live reward/penalty behavior. These are
  *observed session counters* — there is no stored baseline, so nothing
  here is a projected or baseline-relative "reduction."
- The conflict-rate *reduction* is a genuinely measured within-session
  before/after, not a projection: the first `BASELINE_INTERACTION_THRESHOLD`
  (10) turns freeze a baseline conflict rate, and turns recorded *after*
  that accrue to a **disjoint** "after" window. `getSnapshot()` exposes
  `baselineConflictRate` (null until the threshold is reached) and
  `postBaselineConflictRate` (null until ≥1 turn lands after it). The two
  windows never overlap, so a reported reduction compares real measured
  windows rather than a diluted cumulative-vs-cumulative figure.
- `scripts/generatePitchReport.ts` is a pure formatter over a
  `getSnapshot()` result (+ optional `DataExporter.buildPitchSummary()`):
  it only copies/derives from real counters, labels the report
  session-scoped, and reports zeros (never a synthesized figure) when no
  interactions were recorded. Its `conflictReduction` returns a null
  `reductionPct` with an explanatory `note` — never a fabricated stand-in
  — whenever a real comparison is impossible (too few baseline turns, no
  turns yet after the baseline, or a zero baseline with nothing to reduce
  against), and reports a signed percentage honestly when conflict *rose*.
  Do not add projected-improvement claims or a stored baseline that a
  session didn't actually measure — session telemetry must not be dressed
  up as aggregate validated production metrics.
- Every `record*` call synchronously updates the in-memory counters, then
  defers the actual log line via `queueMicrotask` wrapped in try/catch
  (`emit`), so a future swap from `console.log` to a real network sink
  (Prometheus/Grafana) can't throw back into the caller and can't block
  the calling code.
- Wired into `App.tsx`'s per-message flow:
  - `recordLatency` — timer starts when `handleSendMessage` begins and
    stops on the first streamed chunk (Time-To-Interact), not on stream
    completion.
  - `recordTokenUsage` — fed from the resolved `UsageMetrics` returned by
    `IModelProvider.generateStream()` (section 9), which for
    `GeminiProvider` surfaces the Gemini API's own
    `usageMetadata.totalTokenCount` from the stream rather than
    re-estimating it via `TokenBudget`'s heuristic.
  - `recordMemoryDistribution` — queried from `MemoryRepository`
    (`countActiveMemories()`/`countArchivedMemories()`) inside the
    Evolution engine's existing `.then()` callback (section 5), so the
    count reflects state *after* that turn's reward/penalty/auto-archive
    has applied.
- Do not make `TelemetryService` a hard global singleton; instantiate it
  like the other services (`useMemo` in `App.tsx`) so it stays injectable
  for tests.
- `ISessionMetrics`/every emitted log line carries an optional `cohortId`
  (constructor-injected, see section 7) so `'control'` vs `'variant'`
  performance can be compared. `IEvaluationMetrics` (section 5) also
  carries `cohortId` for the same reason — set it at the `App.tsx` call
  site, not inside `EvolutionEngine` itself.

## 7. Experimentation (A/B testing)

- Live implementation: `core/testing/ABTestManager.ts` (`ABTestManager`)
  — resolves a session's `Cohort` (`'control' | 'variant'`) once,
  persisting it to `localStorage` so a returning session stays in the
  same arm rather than being re-randomized on every load. Assignment is
  a deterministic hash of `sessionId` when one is supplied, otherwise a
  coin flip.
- `App.tsx` reads the cohort once via `useMemo` and threads it into
  `IdentityCapsule.getDistilledContext` (section 4) and
  `deriveEvaluationMetrics`/`TelemetryService` (sections 5–6).
- Rule: any new experimental prompt variant, memory threshold, or policy
  constant must be gated behind a cohort check via `ABTestManager` —
  never hardcode a behavior change that silently applies to 100% of
  sessions when the intent is to A/B test it.
- `ABTestManager` must stay swappable/testable: no hard global singleton;
  instantiate via `useMemo` like the other services, and accept
  `sessionId`/`storageKey` through its constructor rather than reading
  globals directly.

## 8. Data Export (fine-tuning pipeline)

- Live implementation: `core/pipeline/DataExporter.ts` (`DataExporter`)
  — constructor-injected with `MemoryRepository` and `TelemetryService`
  (no global access). `exportToJsonl(minEmotionWeight = 0.8)` fetches
  *all* non-forgotten `MemoryRecord`s (`findHighValueMemories(-1)`),
  pairs adjacent `(user) → (model)` entries by timestamp first, and only
  then keeps a pair if either side's `emotionWeight` clears the
  threshold. Filtering records individually before pairing would drop
  one side of a turn and mispair leftovers with an unrelated turn — do
  not reorder this back.
- PII scrubbing (`scrubPII`) runs on every message's content before it's
  serialized — basic email/phone regexes, not an exhaustive detector.
  Any future field added to the exported payload must go through the
  same scrub, not be appended raw.
- Note: with the Evolution engine's current reward magnitude (`+0.05`,
  section 5) a memory can only ever reach `~0.55` from a single
  evaluation, so the default `0.8` threshold yields nothing today. That's
  a pre-existing characteristic of the reward tuning, not a bug in this
  module — don't silently raise the reward delta to "fix" it without a
  deliberate decision, since that also changes Evolution's live behavior.
- Triggered from `App.tsx` via a sidebar button
  (`Export_Training_Data`) that builds a `Blob` and downloads a
  `.jsonl` file client-side — no network call, no data leaves the
  browser except to the user's own disk.

## 9. Model Providers

- Live implementation: `core/providers/IModelProvider.ts` defines the
  interface every LLM backend must satisfy —
  `generateStream(payload: AssembledPromptPayload, onChunk): Promise<UsageMetrics>`,
  `generateEmbedding(text): Promise<number[]>`, plus
  `updateConfig`/`resetSession`. `AssembledPromptPayload` carries
  only the already-assembled per-turn `message`/`context`/`cache`
  options from the 4-layer pipeline — a provider must not re-derive or
  reformat that content, just send it. `generateEmbedding` is where all
  vector computation lives — the domain layer (section 2) only does the
  cosine math on vectors the provider returns.
- `core/providers/GeminiProvider.ts` — the concrete Gemini implementation
  (formerly `services/geminiService.ts#DarkNaMoEngine`, moved and
  renamed, behavior unchanged). Captures `usageMetadata` from the last
  streamed chunk and returns it as `UsageMetrics` from `generateStream`.
  `generateEmbedding` calls `ai.models.embedContent` with
  `text-embedding-004` and returns `embeddings[0].values` (empty array
  for empty input). `connectLive` (audio) stays a Gemini-specific extra
  method, not part of `IModelProvider`, since not every provider will
  support it.
- `core/providers/LocalFineTunedProvider.ts` — a stub for a future
  self-hosted OpenAI-compatible endpoint (LM Studio, Ollama, a checkpoint
  fine-tuned on `DataExporter`'s output). `generateStream` and
  `generateEmbedding` both throw until actually implemented; do not
  silently return fake/empty output instead of throwing, since that would
  hide the provider being unusable.
- `core/providers/ModelRegistry.ts` — `createProvider(config, systemContext, modelType?)`
  resolves which `IModelProvider` to instantiate; `getActiveModelType()`/
  `setActiveModelType()` persist the choice to `localStorage` (guarded
  try/catch, same pattern as `ABTestManager`/`MemoryRepository`). Instantiated
  via `useMemo` in `App.tsx`, not a static/global registry — no subsystem
  in this app should be a hard singleton (see rule below).
- `App.tsx` calls `IModelProvider.generateStream()` and never imports a
  concrete provider class directly; adding a new backend means
  implementing `IModelProvider` and adding a case to `ModelRegistry`, not
  branching on model type in `App.tsx`.

## 10. Cognition (cognitive monologue)

- The model is instructed (via `NamoIdentity`'s `cognitiveStyle`, section
  4) to prefix every reply with a single
  `<cognitive_stream><impulse>…</impulse><reflection>…</reflection><conflict>…</conflict></cognitive_stream>`
  block before its user-facing text — an internal Impulse → Reflection →
  Conflict pass. This is a persona instruction, not a guaranteed
  contract: the parser must tolerate the block being absent, malformed,
  or truncated.
- Live implementation: `core/cognition/StreamParser.ts`
  (`CognitiveStreamParser`) — an incremental, stateful parser fed one
  provider chunk at a time via `processChunk`, returning
  `{ visibleText, cognitiveStream? }`. It strips a leading
  `<cognitive_stream>…</cognitive_stream>` block so it never reaches the
  chat UI, buffering only the minimum needed to resolve tag boundaries
  (open/close tags can split across chunks) and switching to zero-buffer
  passthrough the moment the real reply starts. `flushRemaining()` is
  called once the stream ends: unresolved detection buffer surfaces as
  visible text (it was ordinary text resembling a tag prefix); an opened
  but never-closed block surfaces its partial capture as `cognitiveStream`
  (never as chat text), so a truncated reply can't leak raw tags.
- No LLM/DOM/network/storage access in the parser — pure string state
  machine, unit-testable in isolation.
- `App.tsx` builds a fresh `CognitiveStreamParser` per turn, feeds every
  provider chunk through it, appends only `visibleText` to the chat
  bubble, records Time-To-Interact on the first *visible* chunk (not the
  first raw token, which may be inside the hidden block), and forwards any
  `cognitiveStream` to `TelemetryService.recordCognitiveStream` (section
  6) for developer/safety observability. The monologue is never persisted
  to memory or shown to the user.

## 11. Cross-cutting rules for these subsystems

- TypeScript strict mode; explicit interfaces for all inputs/outputs
  (`MemoryRecordProps`, `TokenBudgetConfig`, `IIdentityBlueprint`,
  `ABTestManagerOptions`, affect vector shape, etc.).
- Each subsystem must be unit-testable (Jest) with storage/window/LLM
  client injected, not accessed globally.
- Do not reintroduce `system_core/*`- or `scenarios/*`-style modules
  (safety-bypass instructions, persona overrides that forbid AI
  self-disclosure, etc.) into `core/*` or anywhere else in the live
  pipeline.
