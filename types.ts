
export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

export interface Persona {
  id: string;
  name: string;
  description: string;
  avatar: string;
}

export interface Metrics {
  arousal: number;
  submission: number;
  possessiveness: number;
  devotion: number;
  // Added fields to match usage in App.tsx and core/Desire_Metric_System.ts
  timeline_stability: number;
  karmic_resonance: number;
}

export interface EngineConfig {
  model: string;
  temperature: number;
  maxOutputTokens: number;
  topP: number;
}
