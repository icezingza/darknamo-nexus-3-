export interface IAffectVector {
  valence: number;   // positivity/negativity of the mood
  arousal: number;   // intensity/energy level
  trust: number;     // accumulated trust over the session
  passion: number;   // depth of engagement
  resonance: number; // emotional alignment with the user
}

export interface IEmotionSignals {
  toneScore: number;     // 0..1, how positive/aligned the interaction reads
  conflictLevel: number; // 0..1, how much friction/negative arousal is present
}

// How much of the previous state carries forward on each update. High
// inertia prevents abrupt mood swings from a single turn.
const INERTIA = 0.7;
// Fraction of the gap to the neutral baseline that arousal/passion close
// each turn when left alone.
const DECAY_RATE = 0.1;
const NEUTRAL_BASELINE = 0.5;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export const createInitialAffect = (): IAffectVector => ({
  valence: NEUTRAL_BASELINE,
  arousal: NEUTRAL_BASELINE,
  trust: NEUTRAL_BASELINE,
  passion: NEUTRAL_BASELINE,
  resonance: NEUTRAL_BASELINE
});

// Blend old state with the target implied by this turn's signals, weighted
// by INERTIA. Pure: same inputs always yield the same output, no mutation.
export const updateAffect = (
  currentState: IAffectVector,
  signals: IEmotionSignals
): IAffectVector => {
  const tone = clamp01(signals.toneScore);
  const conflict = clamp01(signals.conflictLevel);
  const blend = (previous: number, target: number) =>
    clamp01(INERTIA * previous + (1 - INERTIA) * target);

  return {
    // High tone lifts valence; conflict drags it down.
    valence: blend(currentState.valence, clamp01(tone * (1 - conflict))),
    // Conflict spikes arousal; a calm positive turn settles it toward neutral.
    arousal: blend(currentState.arousal, clamp01(conflict > 0 ? conflict : NEUTRAL_BASELINE * tone)),
    // Trust erodes with conflict, and only slowly builds with good tone.
    trust: blend(currentState.trust, clamp01(currentState.trust + (tone - conflict) * 0.5)),
    // Engagement deepens with either strong positive tone or strong friction.
    passion: blend(currentState.passion, clamp01(Math.max(tone, conflict))),
    // Alignment tracks tone directly, penalized by conflict.
    resonance: blend(currentState.resonance, clamp01(tone * (1 - conflict)))
  };
};

// Relax the volatile dimensions toward the neutral baseline over time.
// Trust is deliberately sticky -- it should not fade just because a turn
// passed; it only moves meaningfully through updateAffect's penalties.
export const applyDecay = (currentState: IAffectVector): IAffectVector => {
  const decayToward = (value: number) =>
    clamp01(value + (NEUTRAL_BASELINE - value) * DECAY_RATE);

  return {
    valence: currentState.valence,
    arousal: decayToward(currentState.arousal),
    trust: currentState.trust,
    passion: decayToward(currentState.passion),
    resonance: currentState.resonance
  };
};

export class EmotionEngine {
  updateAffect(currentState: IAffectVector, signals: IEmotionSignals): IAffectVector {
    return updateAffect(currentState, signals);
  }

  applyDecay(currentState: IAffectVector): IAffectVector {
    return applyDecay(currentState);
  }

  createInitialAffect(): IAffectVector {
    return createInitialAffect();
  }
}
