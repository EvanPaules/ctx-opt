import type { Message, ContentBlock } from '../types.js';

export type AnyParams = Record<string, unknown>;

export function toCtxMessagesFromOpenAI(input: unknown[]): Message[] {
  return input.map((raw): Message => {
    const m = raw as { role: string; content: unknown; name?: string; tool_call_id?: string };
    const role = normalizeOpenAIRole(m.role);
    return {
      role,
      content: openAIContentToCtx(m.content),
      ...(m.name ? { name: m.name } : {}),
      ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
    };
  });
}

export function fromCtxMessagesToOpenAI(messages: Message[]): unknown[] {
  return messages.map((m) => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : ctxBlocksToOpenAIContent(m.content),
    ...(m.name ? { name: m.name } : {}),
    ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
  }));
}

function normalizeOpenAIRole(role: string): Message['role'] {
  if (role === 'system' || role === 'user' || role === 'assistant' || role === 'tool') {
    return role;
  }
  return 'user';
}

function openAIContentToCtx(content: unknown): Message['content'] {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const blocks: ContentBlock[] = [];
  for (const part of content) {
    const p = part as { type?: string; text?: string };
    if (p.type === 'text' && typeof p.text === 'string') {
      blocks.push({ type: 'text', text: p.text });
    }
  }
  return blocks.length > 0 ? blocks : '';
}

function ctxBlocksToOpenAIContent(blocks: ContentBlock[]): unknown {
  return blocks.map((b) => {
    if (b.type === 'text') return { type: 'text', text: b.text };
    if (b.type === 'tool_use') return { type: 'text', text: `[tool_use:${b.name}] ${JSON.stringify(b.input)}` };
    if (b.type === 'tool_result') return { type: 'text', text: `[tool_result] ${b.content}` };
    return { type: 'text', text: '' };
  });
}

export interface AnthropicSplit {
  system: string | undefined;
  messages: Message[];
}

export function ctxToAnthropicSplit(messages: Message[]): AnthropicSplit {
  const systemParts: string[] = [];
  const rest: Message[] = [];
  for (const m of messages) {
    if (m.role === 'system') {
      systemParts.push(typeof m.content === 'string' ? m.content : flattenBlocks(m.content));
    } else {
      rest.push(m);
    }
  }
  return {
    system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
    messages: rest,
  };
}

export function anthropicInputToCtx(
  systemInput: unknown,
  messagesInput: unknown[]
): Message[] {
  const out: Message[] = [];
  const system = anthropicSystemToText(systemInput);
  if (system) out.push({ role: 'system', content: system });

  for (const raw of messagesInput) {
    const m = raw as { role: string; content: unknown };
    const role: Message['role'] = m.role === 'assistant' ? 'assistant' : 'user';
    out.push({ role, content: anthropicContentToCtx(m.content) });
  }
  return out;
}

export function ctxMessagesToAnthropicInput(messages: Message[]): unknown[] {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: typeof m.content === 'string' ? m.content : ctxBlocksToAnthropicContent(m.content),
  }));
}

function anthropicSystemToText(system: unknown): string {
  if (!system) return '';
  if (typeof system === 'string') return system;
  if (Array.isArray(system)) {
    return system
      .map((b) => {
        const p = b as { type?: string; text?: string };
        return p.type === 'text' && typeof p.text === 'string' ? p.text : '';
      })
      .filter(Boolean)
      .join('\n\n');
  }
  return '';
}

function anthropicContentToCtx(content: unknown): Message['content'] {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const blocks: ContentBlock[] = [];
  for (const part of content) {
    const p = part as {
      type?: string;
      text?: string;
      id?: string;
      name?: string;
      input?: unknown;
      tool_use_id?: string;
      content?: unknown;
    };
    if (p.type === 'text' && typeof p.text === 'string') {
      blocks.push({ type: 'text', text: p.text });
    } else if (p.type === 'tool_use' && typeof p.id === 'string' && typeof p.name === 'string') {
      blocks.push({ type: 'tool_use', id: p.id, name: p.name, input: p.input });
    } else if (p.type === 'tool_result' && typeof p.tool_use_id === 'string') {
      const text = typeof p.content === 'string' ? p.content : flattenAnthropicResultContent(p.content);
      blocks.push({ type: 'tool_result', tool_use_id: p.tool_use_id, content: text });
    }
  }
  return blocks.length > 0 ? blocks : '';
}

function ctxBlocksToAnthropicContent(blocks: ContentBlock[]): unknown {
  return blocks.map((b) => {
    if (b.type === 'text') return { type: 'text', text: b.text };
    if (b.type === 'tool_use') return { type: 'tool_use', id: b.id, name: b.name, input: b.input };
    if (b.type === 'tool_result') return { type: 'tool_result', tool_use_id: b.tool_use_id, content: b.content };
    return { type: 'text', text: '' };
  });
}

function flattenAnthropicResultContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((b) => {
      const p = b as { type?: string; text?: string };
      return p.type === 'text' && typeof p.text === 'string' ? p.text : '';
    })
    .filter(Boolean)
    .join('\n');
}

function flattenBlocks(blocks: ContentBlock[]): string {
  return blocks
    .map((b) => {
      if (b.type === 'text') return b.text;
      if (b.type === 'tool_use') return `[tool_use:${b.name}]`;
      if (b.type === 'tool_result') return `[tool_result] ${b.content}`;
      return '';
    })
    .filter(Boolean)
    .join('\n');
}
