
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
  peace_index: number;
  wisdom_score: number;
  letting_go_ratio: number;
  // Added fields to match usage in App.tsx and core/Desire_Metric_System.ts
  timeline_stability: number;
  karmic_resonance: number;
}

export interface EngineConfig {
  model: string;
  temperature: number;
  maxOutputTokens: number;
  topP: number;
  thinkingEnabled?: boolean;
  useSearch?: boolean;
}
