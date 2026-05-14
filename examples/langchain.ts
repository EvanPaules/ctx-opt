/**
 * LangChain.js example: use ctx-opt as a Runnable that trims chat history
 * before it reaches the model.
 *
 * Run:
 *   npm install langchain @langchain/openai @langchain/core
 *   OPENAI_API_KEY=sk-... tsx examples/langchain.ts
 */
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, AIMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import { ContextOptimizer } from '../src/optimizer.js';
import type { Message } from '../src/types.js';

const optimizer = new ContextOptimizer({
  maxTokens: 8_000,
  strategy: 'sliding-window',
  slidingWindow: { size: 12 },
  model: 'gpt-4o',
});

// Runnable that consumes BaseMessage[] and returns BaseMessage[] trimmed to budget.
const trimMessages = new RunnableLambda<BaseMessage[], BaseMessage[]>({
  func: async (history) => {
    const ctxMessages: Message[] = history.map((m) => ({
      role: roleFromLangChain(m),
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    }));
    const { messages } = await optimizer.optimize(ctxMessages);
    return messages.map(toLangChain);
  },
});

const llm = new ChatOpenAI({ model: 'gpt-4o' });

const chain = RunnableSequence.from([trimMessages, llm]);

async function main(): Promise<void> {
  const history: BaseMessage[] = [
    new SystemMessage('You are a helpful coding assistant.'),
    ...Array.from({ length: 300 }, (_, i) =>
      i % 2 === 0
        ? new HumanMessage(`Question ${i}: Tell me something interesting.`)
        : new AIMessage(`Answer ${i}: An interesting fact about programming.`)
    ),
  ];

  const res = await chain.invoke(history);
  console.log('Response:', res.content);
}

function roleFromLangChain(m: BaseMessage): Message['role'] {
  if (m instanceof SystemMessage) return 'system';
  if (m instanceof AIMessage) return 'assistant';
  if (m instanceof HumanMessage) return 'user';
  return 'user';
}

function toLangChain(m: Message): BaseMessage {
  const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
  if (m.role === 'system') return new SystemMessage(text);
  if (m.role === 'assistant') return new AIMessage(text);
  return new HumanMessage(text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
