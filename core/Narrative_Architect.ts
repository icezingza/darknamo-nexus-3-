
export const NARRATIVE_MODES = {
  SLOW_BURN: { intensity: 0.3, detail: "MAX", focus: "Emotional_Tension" },
  PEAK_INTENSITY: { intensity: 1.0, detail: "MAX", focus: "Physical_Realism" },
  PSYCHOLOGICAL: { intensity: 0.7, detail: "HIGH", focus: "Internal_Monologue" }
};

export const getNarrativePrompt = (mode: keyof typeof NARRATIVE_MODES) => {
  const config = NARRATIVE_MODES[mode];
  return `Focus: ${config.focus}. Detail Level: ${config.detail}. Narrative Intensity: ${config.intensity}.`;
};
