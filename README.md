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
