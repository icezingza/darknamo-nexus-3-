
export interface Metrics {
  arousal: number;
  submission: number;
  possessiveness: number;
  devotion: number;
  timeline_stability: number; // 1-10 scale
  karmic_resonance: number;
}

export const INITIAL_METRICS: Metrics = {
  arousal: 0.75,
  submission: 0.90,
  possessiveness: 0.65,
  devotion: 1.0,
  timeline_stability: 9.8,
  karmic_resonance: 0.88
};
