import { ContextOptimizer } from '../optimizer.js';
import type { OptimizerConfig, OptimizeMeta, Message } from '../types.js';
import {
  aiSdkMessagesToCtx,
  ctxMessagesToAiSdk,
  type AnyParams,
} from './shared.js';

export interface OptimizedAiFn<T extends (...args: never[]) => unknown> {
  (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>>;
  readonly optimizer: ContextOptimizer;
  readonly lastMeta: OptimizeMeta | undefined;
}

/**
 * Wrap a Vercel AI SDK function (e.g. `generateText`, `streamText`,
 * `generateObject`, `streamObject`) so that its `messages` array is
 * trimmed to budget before forwarding.
 *
 * Because optimization is asynchronous, the returned function is also
 * asynchronous — call it with `await` even if the original was sync.
 *
 * @example
 * ```ts
 * import { generateText, streamText } from 'ai';
 * import { withOptimizer } from 'ctx-opt/ai-sdk';
 *
 * const trimmedGenerate = withOptimizer(generateText, {
 *   maxTokens: 8_000,
 *   strategy: 'sliding-window',
 * });
 *
 * const { text } = await trimmedGenerate({
 *   model: openai('gpt-4o'),
 *   messages: longHistory,
 * });
 * ```
 */
export function withOptimizer<T extends (params: AnyParams) => unknown>(
  fn: T,
  config: OptimizerConfig | ContextOptimizer
): OptimizedAiFn<T> {
  const optimizer =
    config instanceof ContextOptimizer ? config : new ContextOptimizer(config);
  const state = { lastMeta: undefined as OptimizeMeta | undefined };

  const wrapped = (async function wrapped(params: AnyParams) {
    if (!Array.isArray(params.messages)) {
      return fn(params);
    }
    const ctxMessages = aiSdkMessagesToCtx(params.messages);
    if (typeof params.system === 'string') {
      ctxMessages.unshift({ role: 'system', content: params.system });
    }
    const { messages, meta } = await optimizer.optimize(ctxMessages);
    state.lastMeta = meta;

    // If the caller passed `system` as a top-level field, split it back out.
    const next: AnyParams = { ...params, messages: ctxMessagesToAiSdk(messages) };
    if (typeof params.system === 'string') {
      const systemMsgs = messages.filter((m) => m.role === 'system');
      const restMsgs = messages.filter((m) => m.role !== 'system');
      if (systemMsgs.length > 0) {
        next.system = systemMsgs
          .map((m) => (typeof m.content === 'string' ? m.content : ''))
          .filter(Boolean)
          .join('\n\n');
      } else {
        delete next.system;
      }
      next.messages = ctxMessagesToAiSdk(restMsgs);
    }
    return fn(next);
  }) as unknown as OptimizedAiFn<T>;

  Object.defineProperty(wrapped, 'optimizer', { value: optimizer, enumerable: true });
  Object.defineProperty(wrapped, 'lastMeta', {
    enumerable: true,
    get: () => state.lastMeta,
  });

  return wrapped;
}

/**
 * Pre-process a `CoreMessage[]` array (Vercel AI SDK's message format)
 * down to a token budget. Useful when you want to call AI SDK functions
 * with the optimized messages directly, without wrapping the function.
 *
 * @example
 * ```ts
 * import { streamText } from 'ai';
 * import { trimMessages } from 'ctx-opt/ai-sdk';
 *
 * const messages = await trimMessages(history, {
 *   maxTokens: 8_000,
 *   strategy: 'sliding-window',
 * });
 * const result = streamText({ model: openai('gpt-4o'), messages });
 * ```
 */
export async function trimMessages<T extends unknown[]>(
  messages: T,
  config: OptimizerConfig | ContextOptimizer
): Promise<T> {
  const optimizer =
    config instanceof ContextOptimizer ? config : new ContextOptimizer(config);
  const ctxMessages: Message[] = aiSdkMessagesToCtx(messages);
  const { messages: optimized } = await optimizer.optimize(ctxMessages);
  return ctxMessagesToAiSdk(optimized) as T;
}
