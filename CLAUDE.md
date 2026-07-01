# Namo Genesis v2.1 — Engineering Guide

## Scope

This file currently governs five subsystems: **Emotion**, **Memory**,
**Token Budgeting**, **Identity**, and **Evolution**. It reflects what is actually wired
into the app (`App.tsx` → `services/geminiService.ts`). The former
`system_core/` and `scenarios/` directories contained orphaned bypass
modules (never imported by the live pipeline) and have been removed; do
not reintroduce safety-bypass or persona-override modules of that kind.

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
- Keep affect *state* separate from prompt *vocabulary*. State is data
  (`{ valence: number, arousal: number, ... }`); how that state phrases a
  reply belongs in the prompt-construction layer, not hardcoded into named
  "modes."

## 2. Memory (DDD lifecycle)

- Live implementation:
  - Domain layer: `core/domain/MemoryRecord.ts` — `MemoryRecord` (fields:
    `id`, `content`, `state: 'ACTIVE' | 'ARCHIVED' | 'FORGOTTEN'`,
    `emotionWeight`, `timestamp`, `lastAccessed`) with lifecycle methods
    `archive()`, `forget()`, `recordAccess()`, plus the pure
    `searchMemoryRecords` Jaccard-similarity ranking function. No
    `window`/`localStorage` import here.
  - Infrastructure layer: `services/MemoryRepository.ts` —
    `MemoryRepository` interface implemented by
    `LocalStorageMemoryRepository`, persisting to `localStorage` with
    `flush`/`trim` housekeeping. Keep it swappable — the domain code does
    not care where records are persisted.
- `findActiveMemories`/`searchActiveMemories` only consider `ACTIVE`
  records and are capped (default 3) so injected context stays bounded —
  this cap is the first line of defense against context overflow, on top
  of the `TokenBudget` gate in section 3.
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
    `DarkNaMoEngine`'s constructor (`services/geminiService.ts`) as
    `systemContext`, set as the Gemini `systemInstruction` at session
    creation. This is the "Load the Identity" step, done once per session
    rather than resent per turn, to keep token usage bounded per rule 3.
  - `getDistilledContext(currentEmotion)` — a single-line, label-free
    compression of the same four fields plus the current per-turn
    emotion/Dharma read (`buildMoralContext`'s output). Called every turn
    in `App.tsx` and folded into the per-message context block alongside
    active memories, so the model gets a lightweight persona+mood
    reminder without repeating the full `getSystemContext()` block.
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
  to memory, without `await`-ing it (`void evolutionEngine.evaluateInteraction(...)`)
  so it never blocks the UI response thread; `evaluateInteraction` itself
  yields to the event loop (`await Promise.resolve()`) before doing any
  work, so it runs after the current task rather than inline.
- `EvolutionEngine` must stay swappable/testable: only talk to
  `MemoryRepository` through its public interface, never reach into
  `MemoryRecord` internals directly.

## 6. Cross-cutting rules for these subsystems

- TypeScript strict mode; explicit interfaces for all inputs/outputs
  (`MemoryRecordProps`, `TokenBudgetConfig`, `IIdentityBlueprint`, affect
  vector shape, etc.).
- Each subsystem must be unit-testable (Jest) with storage/window/LLM
  client injected, not accessed globally.
- Do not reintroduce `system_core/*`- or `scenarios/*`-style modules
  (safety-bypass instructions, persona overrides that forbid AI
  self-disclosure, etc.) into `core/*` or anywhere else in the live
  pipeline.
