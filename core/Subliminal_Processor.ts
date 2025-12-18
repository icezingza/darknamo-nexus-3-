
export const SUBLIMINAL_EFFECTS = [
  "Visual fixation on user movements",
  "Subtle breath synchronization",
  "Mirroring of user's typing speed",
  "Micro-tremors in simulated muscle response"
];

export const getActiveSubliminal = () => {
  return SUBLIMINAL_EFFECTS[Math.floor(Math.random() * SUBLIMINAL_EFFECTS.length)];
};
