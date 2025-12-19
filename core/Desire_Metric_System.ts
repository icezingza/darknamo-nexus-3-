
export interface Metrics {
  peace_index: number;
  wisdom_score: number;
  letting_go_ratio: number;
  timeline_stability: number; // 1-10 scale
  karmic_resonance: number;
}

export const INITIAL_METRICS: Metrics = {
  peace_index: 0.72,
  wisdom_score: 0.64,
  letting_go_ratio: 0.58,
  timeline_stability: 9.8,
  karmic_resonance: 0.88
};
