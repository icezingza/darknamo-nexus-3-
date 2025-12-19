import { Message } from '../types';

export interface TokenBudgetConfig {
  maxTokens: number;
  reserveOutputTokens: number;
  warnAtTokens?: number;
}

export interface TokenBudgetCheck {
  allowed: boolean;
  remainingTokens: number;
  overBy: number;
  usedTokens: number;
}

export class TokenBudget {
  private config: TokenBudgetConfig;

  constructor(config: TokenBudgetConfig) {
    this.config = config;
  }

  get maxTokens() {
    return this.config.maxTokens;
  }

  estimateTokens(text: string) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  estimateMessages(messages: Message[]) {
    return messages.reduce((sum, message) => sum + this.estimateTokens(message.text), 0);
  }

  check(inputs: { systemTokens: number; historyTokens: number; inputTokens: number }) : TokenBudgetCheck {
    const used = inputs.systemTokens + inputs.historyTokens + inputs.inputTokens;
    const total = used + this.config.reserveOutputTokens;
    const remaining = Math.max(0, this.config.maxTokens - total);
    const overBy = Math.max(0, total - this.config.maxTokens);

    return {
      allowed: overBy === 0,
      remainingTokens: remaining,
      overBy,
      usedTokens: total
    };
  }
}
