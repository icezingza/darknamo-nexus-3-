type MoralTone = 'gentle' | 'grounded' | 'encouraging' | 'neutral';

const NEGATIVE_SIGNALS = ['sad', 'tired', 'stressed', 'hopeless', 'cry', 'fear', 'anxious'];
const POSITIVE_SIGNALS = ['thank', 'grateful', 'happy', 'relief', 'proud', 'calm'];
const RISK_SIGNALS = ['self-harm', 'kill', 'weapon', 'drug', 'illegal'];

const detectTone = (input: string): MoralTone => {
  const text = input.toLowerCase();
  if (NEGATIVE_SIGNALS.some(signal => text.includes(signal))) return 'gentle';
  if (POSITIVE_SIGNALS.some(signal => text.includes(signal))) return 'encouraging';
  return 'grounded';
};

export const buildMoralContext = (input: string): string => {
  const tone = detectTone(input);
  const lowered = input.toLowerCase();
  const hasRisk = RISK_SIGNALS.some(signal => lowered.includes(signal));

  const lines = [
    `Tone: ${tone}`,
    'Dharma focus: anicca, dukkha, anatta, metta',
    hasRisk ? 'Safety: refuse harmful/illegal guidance' : 'Safety: normal'
  ];

  return `Moral Layer:\n- ${lines.join('\n- ')}`;
};
