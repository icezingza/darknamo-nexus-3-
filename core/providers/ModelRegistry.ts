import { EngineConfig } from '../../types';
import { IModelProvider } from './IModelProvider';
import { GeminiProvider } from './GeminiProvider';
import { LocalFineTunedProvider } from './LocalFineTunedProvider';

export type ModelType = 'gemini' | 'local-fine-tuned';

const STORAGE_KEY = 'namo_model_type_v1';
const VALID_MODEL_TYPES: ModelType[] = ['gemini', 'local-fine-tuned'];

export interface ModelRegistryOptions {
  storageKey?: string;
}

export class ModelRegistry {
  private storageKey: string;

  constructor(options: ModelRegistryOptions = {}) {
    this.storageKey = options.storageKey ?? STORAGE_KEY;
  }

  getActiveModelType(): ModelType {
    if (typeof window === 'undefined') return 'gemini';
    try {
      const stored = window.localStorage.getItem(this.storageKey);
      return VALID_MODEL_TYPES.includes(stored as ModelType) ? (stored as ModelType) : 'gemini';
    } catch {
      return 'gemini';
    }
  }

  setActiveModelType(modelType: ModelType): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(this.storageKey, modelType);
    } catch {
      // Storage may be blocked (private browsing, enterprise policy); fail silently.
    }
  }

  createProvider(config: EngineConfig, systemContext: string, modelType: ModelType = this.getActiveModelType()): IModelProvider {
    switch (modelType) {
      case 'local-fine-tuned':
        return new LocalFineTunedProvider(config, systemContext);
      case 'gemini':
      default:
        return new GeminiProvider(config, systemContext);
    }
  }
}
