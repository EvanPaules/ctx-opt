import type {
  Message,
  OptimizerConfig,
  OptimizeInput,
  OptimizeMeta,
  OptimizeResult,
  StrategyName,
} from './types.js';
import { countMessageTokens } from './token-counter.js';
import { applySlidingWindow } from './strategies/sliding-window.js';
import { applySummarizer } from './strategies/summarizer.js';
import { applyRelevance } from './strategies/relevance.js';
import { resolvePricing, tokensToUsd } from './pricing.js';

export class ContextOptimizer {
  private config: OptimizerConfig;

  constructor(config: OptimizerConfig) {
    this.config = { ...config };
  }

  async optimize(messages: Message[], input?: OptimizeInput): Promise<OptimizeResult> {
    const strategy = input?.forceStrategy ?? this.config.strategy;
    const model = this.config.model;
    const inputTokens = countMessageTokens(messages, model);

    // If already within budget, return unchanged with metadata.
    if (inputTokens <= this.config.maxTokens) {
      return {
        messages,
        meta: this.buildMeta({
          inputTokens,
          outputTokens: inputTokens,
          strategyUsed: strategy,
          messagesDropped: 0,
          messagesSummarized: 0,
        }),
      };
    }

    let result: { messages: Message[]; messagesDropped: number; messagesSummarized: number };

    switch (strategy) {
      case 'sliding-window': {
        const r = applySlidingWindow(messages, this.config);
        result = { ...r, messagesSummarized: 0 };
        break;
      }
      case 'summarizer': {
        const r = await applySummarizer(messages, this.config);
        result = r;
        break;
      }
      case 'relevance': {
        const r = await applyRelevance(messages, this.config, input?.task);
        result = { ...r, messagesSummarized: 0 };
        break;
      }
      case 'hybrid': {
        result = await this.runHybrid(messages, input?.task);
        break;
      }
      default: {
        const _exhaustive: never = strategy;
        throw new Error(`unknown strategy: ${String(_exhaustive)}`);
      }
    }

    const outputTokens = countMessageTokens(result.messages, model);

    return {
      messages: result.messages,
      meta: this.buildMeta({
        inputTokens,
        outputTokens,
        strategyUsed: strategy,
        messagesDropped: result.messagesDropped,
        messagesSummarized: result.messagesSummarized,
      }),
    };
  }

  countTokens(messages: Message[]): number {
    return countMessageTokens(messages, this.config.model);
  }

  withinBudget(messages: Message[]): boolean {
    return this.countTokens(messages) <= this.config.maxTokens;
  }

  updateConfig(patch: Partial<OptimizerConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  private async runHybrid(
    messages: Message[],
    task: string | undefined
  ): Promise<{ messages: Message[]; messagesDropped: number; messagesSummarized: number }> {
    const model = this.config.model;
    let messagesDropped = 0;
    let messagesSummarized = 0;
    let current = messages;

    if (this.config.relevance) {
      const r = await applyRelevance(current, this.config, task);
      messagesDropped += r.messagesDropped;
      current = r.messages;
    }

    if (
      countMessageTokens(current, model) > this.config.maxTokens &&
      this.config.summarizer
    ) {
      const s = await applySummarizer(current, this.config);
      messagesDropped += Math.max(0, current.length - s.messages.length - (s.messagesSummarized > 0 ? 1 : 0));
      messagesSummarized += s.messagesSummarized;
      current = s.messages;
    }

    if (countMessageTokens(current, model) > this.config.maxTokens) {
      const fb = applySlidingWindow(current, this.config);
      messagesDropped += fb.messagesDropped;
      current = fb.messages;
    }

    return { messages: current, messagesDropped, messagesSummarized };
  }

  private buildMeta(args: {
    inputTokens: number;
    outputTokens: number;
    strategyUsed: StrategyName;
    messagesDropped: number;
    messagesSummarized: number;
  }): OptimizeMeta {
    const saved = Math.max(0, args.inputTokens - args.outputTokens);
    const pricing = resolvePricing(this.config.model, this.config.pricing);
    const meta: OptimizeMeta = {
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      saved,
      compressionRatio: args.inputTokens > 0 ? args.outputTokens / args.inputTokens : 1,
      strategyUsed: args.strategyUsed,
      messagesDropped: args.messagesDropped,
      messagesSummarized: args.messagesSummarized,
      withinBudget: args.outputTokens <= this.config.maxTokens,
    };
    if (pricing) {
      meta.inputCostUsd = tokensToUsd(args.outputTokens, pricing);
      meta.savedUsd = tokensToUsd(saved, pricing);
    }
    return meta;
  }
}
