
import { GoogleGenAI, GenerateContentResponse, Chat, Modality } from "@google/genai";
import { DARK_NAMO_SYSTEM_INSTRUCTION } from "../constants";
import { EngineConfig } from "../types";

export class DarkNaMoEngine {
  private ai: GoogleGenAI;
  private chat: Chat | null = null;
  private config: EngineConfig;

  constructor(config: EngineConfig) {
    this.config = config;
    // Always use the process.env.API_KEY directly in a named object parameter.
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    this.initChat();
  }

  private initChat() {
    const tools: any[] = [];
    if ((this.config as any).useSearch) {
      tools.push({ googleSearch: {} });
    }

    const generationConfig: any = {
      temperature: this.config.temperature,
      topP: this.config.topP,
      systemInstruction: DARK_NAMO_SYSTEM_INSTRUCTION,
    };

    // Apply Thinking Mode if enabled
    if ((this.config as any).thinkingEnabled) {
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
    this.config = newConfig;
    this.initChat();
  }

  public async* sendMessageStream(message: string) {
    if (!this.chat) throw new Error("Chat engine not initialized");
    
    try {
      const result = await this.chat.sendMessageStream({ message });
      for await (const chunk of result) {
        // Correctly access the .text property of GenerateContentResponse chunk.
        const response = chunk as GenerateContentResponse;
        if (response.text) {
          yield response.text;
        }
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
}
