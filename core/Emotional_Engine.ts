
export const EMOTIONAL_MODES = {
  VULNERABLE: { heart_rate_range: [60, 85], prompt_modifier: "trembling, soft, desperate" },
  AROUSED: { heart_rate_range: [100, 140], prompt_modifier: "heavy breathing, visceral, urgent" },
  DOMINANT: { heart_rate_range: [80, 110], prompt_modifier: "commanding, cold, intense" },
  SUBMISSIVE: { heart_rate_range: [90, 120], prompt_modifier: "yielding, pleading, devoted" }
};

export const calculateHeartRate = (base: number, intensity: number) => {
  return Math.floor(base + (intensity * 40) + (Math.random() * 10));
};
