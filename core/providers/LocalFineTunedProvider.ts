import { EngineConfig } from '../../types';
import { AssembledPromptPayload, IModelProvider, UsageMetrics } from './IModelProvider';

const DEFAULT_ENDPOINT = 'http://localhost:1234/v1/chat/completions';

export interface LocalFineTunedProviderOptions {
  endpoint?: string;
}

// Stub for a future self-hosted, OpenAI-compatible endpoint (LM Studio,
// Ollama, a fine-tuned NaMo checkpoint from DataExporter's .jsonl output,
// etc.). Not wired up to a real server -- generateStream throws until this
// is implemented, so the fallback here is: don't select this provider.
export class LocalFineTunedProvider implements IModelProvider {
  private endpoint: string;

  constructor(_config: EngineConfig, _systemContext: string, options: LocalFineTunedProviderOptions = {}) {
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  }

  async generateStream(_payload: AssembledPromptPayload, _onChunk: (chunk: string) => void): Promise<UsageMetrics> {
    throw new Error(
      `LocalFineTunedProvider is a stub and not yet implemented. It should stream from an OpenAI-compatible chat completions endpoint at ${this.endpoint}.`
    );
  }

  async generateEmbedding(_text: string): Promise<number[]> {
    throw new Error(
      `LocalFineTunedProvider is a stub and not yet implemented. It should call an OpenAI-compatible embeddings endpoint at ${this.endpoint}.`
    );
  }

  updateConfig(_config: EngineConfig): void {
    // No-op until a real connection exists.
  }

  resetSession(): void {
    // No-op until a real connection exists.
  }
}
