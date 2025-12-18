
import { VOICE_REGISTRY } from './voice/Voice_ID_Registry';

const ELEVENLABS_API_KEY = "2e94f0eedc8917aae70e1d35e0360201b57cd18d4ab59c19b1a085e8295b3dd7";

export class ElevenLabsService {
  private static audioContext: AudioContext | null = null;
  private static currentSource: AudioBufferSourceNode | null = null;

  private static getContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.audioContext;
  }

  /**
   * Generates and plays voice for the given text using Midori's voice ID.
   * Returns a promise that resolves when audio playback finishes.
   */
  public static async speak(text: string, personaKey: keyof typeof VOICE_REGISTRY.personas = 'midori_default'): Promise<void> {
    const config = VOICE_REGISTRY.personas[personaKey];
    if (!config) return;

    // Clean text: Remove parenthetical actions (actions) so she only speaks dialogue
    const dialogueOnly = text.replace(/\([^)]*\)/g, '').trim();
    if (!dialogueOnly) return;

    // Stop previous audio if any
    if (this.currentSource) {
      try { this.currentSource.stop(); } catch(e) {}
    }

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${config.voice_id}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: dialogueOnly,
          model_id: config.model_id,
          voice_settings: config.settings
        }),
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.statusText}`);
      }

      const audioArrayBuffer = await response.arrayBuffer();
      const context = this.getContext();
      const audioBuffer = await context.decodeAudioData(audioArrayBuffer);
      
      return new Promise((resolve) => {
        const source = context.createBufferSource();
        this.currentSource = source;
        source.buffer = audioBuffer;
        source.connect(context.destination);
        source.onended = () => {
          this.currentSource = null;
          resolve();
        };
        source.start(0);
      });
    } catch (error) {
      console.error("Voice Synthesis Failed:", error);
      throw error;
    }
  }
}
