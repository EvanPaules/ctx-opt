export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  role: Role;
  content: string | ContentBlock[];
  name?: string;
  tool_call_id?: string;
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string };

export type MessageClass =
  | 'system'
  | 'recent'
  | 'tool-pair'
  | 'compressible'
  | 'droppable';

export interface ClassifiedMessage {
  message: Message;
  index: number;
  class: MessageClass;
  tokenCount: number;
  relevanceScore?: number;
}

export type StrategyName = 'sliding-window' | 'summarizer' | 'relevance' | 'hybrid';

export interface OptimizerConfig {
  maxTokens: number;
  strategy: StrategyName;
  model?: string;
  preserveSystem?: boolean;
  recentWindow?: number;

  slidingWindow?: {
    size: number;
  };

  summarizer?: {
    llmCall: SummarizerLLMFn;
    maxSummaryTokens?: number;
    triggerThreshold?: number;
    /** Overrides config.recentWindow for this strategy only. */
    recentWindow?: number;
  };

  relevance?: {
    scorer: RelevanceScorerFn;
    minScore?: number;
    /** Overrides config.recentWindow for this strategy only. */
    recentWindow?: number;
  };
}

export type SummarizerLLMFn = (
  messages: Message[],
  instruction: string
) => Promise<string>;

export type RelevanceScorerFn = (
  messages: Message[],
  task: string
) => Promise<number[]>;

export interface OptimizeInput {
  task?: string;
  forceStrategy?: StrategyName;
}

export interface OptimizeResult {
  messages: Message[];
  meta: OptimizeMeta;
}

export interface OptimizeMeta {
  inputTokens: number;
  outputTokens: number;
  saved: number;
  compressionRatio: number;
  strategyUsed: StrategyName;
  messagesDropped: number;
  messagesSummarized: number;
  withinBudget: boolean;
}
