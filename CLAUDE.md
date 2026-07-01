# Namo Genesis v2.1 — Engineering Guide

## Scope

This file currently governs three subsystems only: **Emotion**, **Memory**,
and **Token Budgeting**. It reflects what is actually wired into the app
(`App.tsx` → `services/geminiService.ts`), not the orphaned modules under
`system_core/` and `scenarios/` (those are unused imports/dead code today —
do not treat them as active architecture, and do not wire them into the
live pipeline without a separate, explicit decision from the project owner).

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

- Live implementation: `core/Memory_Vector_Database.ts` (`LocalVectorMemory`)
  — Jaccard-similarity search over tokenized text, persisted to
  `localStorage`, with `flush`/`trim` housekeeping.
- Direction: introduce an explicit domain lifecycle —
  `ACTIVE → ARCHIVED → FORGOTTEN` — as a property of `MemoryItem`, independent
  of storage:
  - Domain layer: `MemoryItem`, lifecycle transition rules, search/ranking
    logic. Must not import `window`/`localStorage`.
  - Infrastructure layer: a `MemoryRepository` interface implemented by
    `LocalVectorMemory` (browser storage today). Keep it swappable — the
    domain code should not care where items are persisted.
- `ARCHIVED` items are excluded from `search()` ranking by default;
  `FORGOTTEN` items are excluded from persistence entirely on next flush.

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

## 4. Cross-cutting rules for these three subsystems

- TypeScript strict mode; explicit interfaces for all inputs/outputs
  (`MemoryItem`, `TokenBudgetConfig`, affect vector shape, etc.).
- Each subsystem must be unit-testable (Jest) with storage/window/LLM
  client injected, not accessed globally.
- `core/*` modules in this scope must not import from `system_core/*` or
  `scenarios/*`.
