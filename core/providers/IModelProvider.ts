import { EngineConfig } from '../../types';

export interface CacheOptions {
  enabled: boolean;
  ttlMs: number;
}

// The already-assembled per-turn payload from the 4-layer pipeline: the
// distilled Identity + active memories + moral/Dharma read (App.tsx's
// `contextBlock`) plus the raw user message. Providers must not re-derive
// or reformat this content -- just send it.
export interface AssembledPromptPayload {
  message: string;
  context?: string;
  cache?: CacheOptions;
}

export interface UsageMetrics {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export interface IModelProvider {
  generateStream(payload: AssembledPromptPayload, onChunk: (chunk: string) => void): Promise<UsageMetrics>;
  generateEmbedding(text: string): Promise<number[]>;
  updateConfig(config: EngineConfig): void;
  resetSession(): void;
}
