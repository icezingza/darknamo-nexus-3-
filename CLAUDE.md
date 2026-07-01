# Namo Genesis v2.1 — Engineering Guide

## Scope

This file currently governs four subsystems: **Emotion**, **Memory**,
**Token Budgeting**, and **Identity**. It reflects what is actually wired
into the app (`App.tsx` → `services/geminiService.ts`). The former
`system_core/` and `scenarios/` directories contained orphaned bypass
modules (never imported by the live pipeline) and have been removed; do
not reintroduce safety-bypass or persona-override modules of that kind.

## 1. Emotion

- Live signal today comes from `core/Unified_Moral_Layer.ts`
  (`buildMoralContext`). `core/Subliminal_Processor.ts` is imported in
  `App.tsx` but is currently unused in the live pipeline, and
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
  — a model-agnostic persona container with four plain string-array fields
  (`purpose`, `cognitiveStyle`, `emotionalPosture`, `ethicalConstraints`)
  and a `getSystemContext()` formatter that renders them into one compact
  prompt chunk. `core/identity/NamoIdentity.ts` holds the concrete NaMo
  persona data (restructured, content-equivalent, from the old
  `constants.ts` monolithic prompt string, which has been removed).
- `getSystemContext()` output is passed once into `DarkNaMoEngine`'s
  constructor (`services/geminiService.ts`) as `systemContext`, set as the
  Gemini `systemInstruction` at session creation — this is the "Load the
  Identity" step of the pipeline, done once per session rather than
  resent per turn, to keep token usage bounded per rule 3.
- Do not hardcode a new monolithic prompt string anywhere in `App.tsx` or
  `services/*`; persona changes go through `IdentityCapsule` fields.
- `IdentityCapsule` must stay pure data + string formatting — no LLM call,
  no DOM/network/storage access, so it stays unit-testable in isolation.

## 5. Cross-cutting rules for these subsystems

- TypeScript strict mode; explicit interfaces for all inputs/outputs
  (`MemoryRecordProps`, `TokenBudgetConfig`, `IdentityCapsuleProps`, affect
  vector shape, etc.).
- Each subsystem must be unit-testable (Jest) with storage/window/LLM
  client injected, not accessed globally.
- Do not reintroduce `system_core/*`- or `scenarios/*`-style modules
  (safety-bypass instructions, persona overrides that forbid AI
  self-disclosure, etc.) into `core/*` or anywhere else in the live
  pipeline.
