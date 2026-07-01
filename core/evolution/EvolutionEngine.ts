import { MemoryRepository } from '../../services/MemoryRepository';
import { MoralSignals, MoralTone } from '../Unified_Moral_Layer';

export interface IEvaluationMetrics {
  toneScore: number;
  conflictLevel: number;
}

const REWARD_DELTA = 0.05;
const PENALTY_DELTA = 0.15;
const TONE_SCORE_THRESHOLD = 0.7;
const CONFLICT_LEVEL_THRESHOLD = 0.5;

const TONE_SCORES: Record<MoralTone, number> = {
  encouraging: 0.9,
  grounded: 0.75,
  gentle: 0.6,
  neutral: 0.5
};

export const deriveEvaluationMetrics = (signals: MoralSignals): IEvaluationMetrics => ({
  toneScore: TONE_SCORES[signals.tone],
  conflictLevel: signals.hasRisk ? 1 : signals.tone === 'gentle' ? 0.5 : 0
});

export class EvolutionEngine {
  constructor(private memoryRepository: MemoryRepository) {}

  async evaluateInteraction(memoryIds: string[], metrics: IEvaluationMetrics): Promise<void> {
    await Promise.resolve();

    const delta = this.resolveDelta(metrics);
    if (delta === 0) return;

    memoryIds.forEach(id => this.memoryRepository.adjustEmotionWeight(id, delta));
    this.memoryRepository.flush();
  }

  private resolveDelta(metrics: IEvaluationMetrics): number {
    if (metrics.conflictLevel >= CONFLICT_LEVEL_THRESHOLD) return -PENALTY_DELTA;
    if (metrics.toneScore >= TONE_SCORE_THRESHOLD) return REWARD_DELTA;
    return 0;
  }
}
