<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Namo Genesis v2.1

A Dharma-guided companion built on Gemini with a distilled system prompt, unified moral layer, and local memory context.

View your app in AI Studio: https://ai.studio/apps/drive/1K0Mn-rAN5ZSvyX9LFVDaUKjCaembmqNT

## Core Architecture

- Harmonized 4-layer pipeline: Emotion, Dharma, Memory, Ethics
- Token budgeting + response cache to reduce overhead
- Local vector-style memory with optional auto-save every 5 minutes
- Streaming responses with optional text-to-speech
- Memory is stored in browser localStorage; use "Reset Session" to clear

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Dogfooding & Pitch Report

Generate a **genuine** pitch report from a real session's telemetry. Every
figure is an observed session counter (Time-To-Interact, token efficiency,
conflict-rate vs. baseline) — nothing is projected or fabricated.

1. Run the app (`npm run dev`) and have a **10+ turn conversation**. The
   conflict-rate baseline only locks after the first 10 turns; with fewer, the
   report honestly prints *"Insufficient data for baseline comparison"* instead
   of inventing a number.
2. Click **Export_Training_Data** in the sidebar. This downloads
   `telemetry_history-<stamp>.json` (alongside the `.jsonl` and
   `pitch_summary.json`).
3. Render the report. Use `--silent` so npm's own banner doesn't leak into the
   file — the report's `# source:` line already goes to stderr, so the output
   file stays clean markdown:

   ```bash
   # auto-locates the newest telemetry_history-*.json in the current directory
   npm run report:pitch --silent > pitch_report.md

   # ...or point at an explicit path (e.g. your Downloads folder)
   npm run report:pitch --silent -- ~/Downloads/telemetry_history-<stamp>.json > pitch_report.md
   ```

   Without `--silent`, npm prints a `> darknamo-nexus@0.0.0 report:pitch` banner
   to stdout that would end up in `pitch_report.md`.

> These are observed telemetry from live session(s), **not** benchmarked or
> validated production metrics — the generated report labels them as such.
