
import { GoogleGenAI, GenerateContentResponse, Chat, Modality } from "@google/genai";
import { DARK_NAMO_SYSTEM_INSTRUCTION } from "../constants";
import { EngineConfig } from "../types";

type CacheOptions = {
  enabled: boolean;
  ttlMs: number;
};

type SendMessageOptions = {
  context?: string;
  cache?: CacheOptions;
};

export class DarkNaMoEngine {
  private ai: GoogleGenAI;
  private chat: Chat | null = null;
  private config: EngineConfig;
  private responseCache = new Map<string, { value: string; expiresAt: number }>();

  constructor(config: EngineConfig) {
    this.config = config;
    // Always use the process.env.API_KEY directly in a named object parameter.
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    this.initChat();
  }

  private initChat() {
    const tools: any[] = [];
    if (this.config.useSearch) {
      tools.push({ googleSearch: {} });
    }

    const generationConfig: any = {
      temperature: this.config.temperature,
      topP: this.config.topP,
      systemInstruction: DARK_NAMO_SYSTEM_INSTRUCTION,
    };

    // Apply Thinking Mode if enabled
    if (this.config.thinkingEnabled) {
      // For gemini-3-pro-preview, use a thinking budget for complex tasks.
      generationConfig.thinkingConfig = { thinkingBudget: 32768 };
      // maxOutputTokens is intentionally omitted when thinking is active unless a budget is also defined.
    } else {
      generationConfig.maxOutputTokens = this.config.maxOutputTokens;
    }

    this.chat = this.ai.chats.create({
      model: this.config.model,
      config: {
        ...generationConfig,
        tools: tools.length > 0 ? tools : undefined,
      },
    });
  }

  public updateConfig(newConfig: EngineConfig) {
    const requiresRestart =
      newConfig.model !== this.config.model ||
      newConfig.temperature !== this.config.temperature ||
      newConfig.topP !== this.config.topP ||
      newConfig.maxOutputTokens !== this.config.maxOutputTokens ||
      newConfig.thinkingEnabled !== this.config.thinkingEnabled ||
      newConfig.useSearch !== this.config.useSearch;

    this.config = newConfig;
    if (requiresRestart) {
      this.initChat();
    }
  }

  public async* sendMessageStream(message: string, options: SendMessageOptions = {}) {
    if (!this.chat) throw new Error("Chat engine not initialized");

    const context = options.context?.trim();
    const payload = context ? `${context}\n\nUser: ${message}` : message;
    const cacheOptions = options.cache;
    const cacheKey = cacheOptions?.enabled ? this.buildCacheKey(payload) : null;

    if (cacheKey) {
      const cached = this.readCache(cacheKey);
      if (cached) {
        yield cached;
        return;
      }
    }

    try {
      const result = await this.chat.sendMessageStream({ message: payload });
      let fullResponse = "";
      for await (const chunk of result) {
        // Correctly access the .text property of GenerateContentResponse chunk.
        const response = chunk as GenerateContentResponse;
        if (response.text) {
          fullResponse += response.text;
          yield response.text;
        }
      }
      if (cacheKey && fullResponse) {
        this.writeCache(cacheKey, fullResponse, cacheOptions?.ttlMs ?? 300000);
      }
    } catch (error) {
      console.error("Gemini API Error:", error);
      yield "⚠️ Engine Failure: connection to singularity lost.";
    }
  }

  // Live API Connection
  public connectLive(callbacks: any) {
    return this.ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      callbacks,
      config: {
        // responseModalities must contain exactly one modality: AUDIO.
        responseModalities: [Modality.AUDIO],
        systemInstruction: DARK_NAMO_SYSTEM_INSTRUCTION,
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
        }
      }
    });
  }

  public resetSession() {
    this.initChat();
  }

  private buildCacheKey(payload: string) {
    const normalized = payload.toLowerCase().replace(/\s+/g, " ").trim();
    return `${this.config.model}|${this.config.temperature}|${this.config.topP}|${normalized}`;
  }

  private readCache(key: string) {
    const entry = this.responseCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.responseCache.delete(key);
      return null;
    }
    return entry.value;
  }

  private writeCache(key: string, value: string, ttlMs: number) {
    this.responseCache.set(key, { value, expiresAt: Date.now() + ttlMs });
    if (this.responseCache.size > 200) {
      const oldestKey = this.responseCache.keys().next().value;
      if (oldestKey) {
        this.responseCache.delete(oldestKey);
      }
    }
  }
}
