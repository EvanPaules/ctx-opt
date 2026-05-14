import { ContextOptimizer } from '../optimizer.js';
import type { OptimizerConfig, OptimizeMeta } from '../types.js';
import {
  toCtxMessagesFromOpenAI,
  fromCtxMessagesToOpenAI,
  type AnyParams,
} from './shared.js';

/**
 * Minimal structural type for the OpenAI client surface we touch.
 * Avoids a hard dependency on the `openai` package's exported types so that
 * `ctx-opt/openai` can be imported without `openai` installed at type-check time.
 */
export interface OpenAILike {
  chat: {
    completions: {
      create: (params: AnyParams, options?: unknown) => Promise<unknown> | unknown;
    };
  };
}

export interface OptimizedOpenAI<T extends OpenAILike> {
  /** The underlying OpenAI client. Use this for endpoints not wrapped here. */
  readonly client: T;
  /** The active optimizer instance. */
  readonly optimizer: ContextOptimizer;
  /** Metadata from the most recent optimize() call, or undefined if none. */
  readonly lastMeta: OptimizeMeta | undefined;
  chat: {
    completions: {
      create: T['chat']['completions']['create'];
    };
  };
}

/**
 * Wrap an OpenAI client so that any call to `chat.completions.create` runs
 * its `messages` array through ctx-opt before forwarding to the SDK.
 *
 * @example
 * ```ts
 * import OpenAI from 'openai';
 * import { withOptimizer } from 'ctx-opt/openai';
 *
 * const ai = withOptimizer(new OpenAI(), {
 *   maxTokens: 8_000,
 *   strategy: 'sliding-window',
 * });
 *
 * const res = await ai.chat.completions.create({
 *   model: 'gpt-4o',
 *   messages: longHistory,
 * });
 * ```
 */
export function withOptimizer<T extends OpenAILike>(
  client: T,
  config: OptimizerConfig | ContextOptimizer
): OptimizedOpenAI<T> {
  const optimizer =
    config instanceof ContextOptimizer ? config : new ContextOptimizer(config);

  const wrapper = {
    client,
    optimizer,
    lastMeta: undefined as OptimizeMeta | undefined,
    chat: {
      completions: {
        create: async (params: AnyParams, options?: unknown) => {
          const rawMessages = params.messages;
          if (!Array.isArray(rawMessages)) {
            return client.chat.completions.create(params, options);
          }
          const ctxMessages = toCtxMessagesFromOpenAI(rawMessages);
          const { messages: optimized, meta } = await optimizer.optimize(ctxMessages);
          wrapper.lastMeta = meta;
          return client.chat.completions.create(
            { ...params, messages: fromCtxMessagesToOpenAI(optimized) },
            options
          );
        },
      },
    },
  };

  return wrapper as OptimizedOpenAI<T>;
}
