import { ContextOptimizer } from '../optimizer.js';
import type { OptimizerConfig, OptimizeMeta } from '../types.js';
import {
  anthropicInputToCtx,
  ctxToAnthropicSplit,
  ctxMessagesToAnthropicInput,
  type AnyParams,
} from './shared.js';

/**
 * Minimal structural type for the Anthropic client surface we touch.
 * Avoids a hard dependency on the `@anthropic-ai/sdk` package's exported
 * types so that `ctx-opt/anthropic` can be imported without the SDK
 * installed at type-check time.
 */
export interface AnthropicLike {
  messages: {
    create: (params: AnyParams, options?: unknown) => Promise<unknown> | unknown;
    stream?: (params: AnyParams, options?: unknown) => unknown;
  };
}

export interface OptimizedAnthropic<T extends AnthropicLike> {
  /** The underlying Anthropic client. Use this for endpoints not wrapped here. */
  readonly client: T;
  /** The active optimizer instance. */
  readonly optimizer: ContextOptimizer;
  /** Metadata from the most recent optimize() call, or undefined if none. */
  readonly lastMeta: OptimizeMeta | undefined;
  messages: {
    create: T['messages']['create'];
    stream: T['messages'] extends { stream: infer S } ? S : never;
  };
}

/**
 * Wrap an Anthropic client so that any call to `messages.create` runs
 * its `system` + `messages` through ctx-opt before forwarding to the SDK.
 *
 * The wrapper hoists `system` into the optimizer's view as a system-role
 * message, runs optimization, then splits it back out for the Anthropic API.
 *
 * @example
 * ```ts
 * import Anthropic from '@anthropic-ai/sdk';
 * import { withOptimizer } from 'ctx-opt/anthropic';
 *
 * const ai = withOptimizer(new Anthropic(), {
 *   maxTokens: 8_000,
 *   strategy: 'sliding-window',
 *   model: 'claude-haiku-4-5-20251001',
 * });
 *
 * const res = await ai.messages.create({
 *   model: 'claude-haiku-4-5-20251001',
 *   max_tokens: 1024,
 *   system: 'you are concise',
 *   messages: longHistory,
 * });
 * ```
 */
export function withOptimizer<T extends AnthropicLike>(
  client: T,
  config: OptimizerConfig | ContextOptimizer
): OptimizedAnthropic<T> {
  const optimizer =
    config instanceof ContextOptimizer ? config : new ContextOptimizer(config);

  async function optimizeParams(params: AnyParams): Promise<AnyParams | null> {
    const rawMessages = params.messages;
    if (!Array.isArray(rawMessages)) return null;

    const ctxMessages = anthropicInputToCtx(params.system, rawMessages);
    const { messages: optimized, meta } = await optimizer.optimize(ctxMessages);
    wrapper.lastMeta = meta;

    const split = ctxToAnthropicSplit(optimized);
    const next: AnyParams = {
      ...params,
      messages: ctxMessagesToAnthropicInput(split.messages),
    };
    if (split.system !== undefined) {
      next.system = split.system;
    } else {
      delete next.system;
    }
    return next;
  }

  const wrapper = {
    client,
    optimizer,
    lastMeta: undefined as OptimizeMeta | undefined,
    messages: {
      create: async (params: AnyParams, options?: unknown) => {
        const next = await optimizeParams(params);
        if (next === null) return client.messages.create(params, options);
        return client.messages.create(next, options);
      },
      // The SDK's stream() helper is sync (returns an event-emitter-style object).
      // We still need to run optimization first, so we wrap the call in a
      // thenable that awaits optimization before delegating. Most callers use
      // `await client.messages.stream(...)` or attach handlers eagerly via
      // .on() — for the latter case, we return a Promise that resolves to the
      // underlying stream object.
      stream: ((params: AnyParams, options?: unknown) => {
        const streamFn = client.messages.stream;
        if (typeof streamFn !== 'function') {
          throw new Error('client.messages.stream is not available on this Anthropic client');
        }
        return (async () => {
          const next = await optimizeParams(params);
          return streamFn.call(client.messages, next ?? params, options);
        })();
      }) as never,
    },
  };

  return wrapper as OptimizedAnthropic<T>;
}
