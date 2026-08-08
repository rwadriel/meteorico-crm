import { createHash } from 'node:crypto';
import type { AiProvider, AiMessage, AiCompletionOptions, AiCompletionResult } from './ai.js';

export class XaiProvider implements AiProvider {
  name = 'xai-grok';
  private readonly baseUrl: string;
  private readonly model: string;

  constructor() {
    this.baseUrl = process.env.XAI_API_BASE_URL ?? 'https://api.x.ai/v1';
    this.model = process.env.XAI_MODEL ?? 'grok-3-mini';
  }

  isAvailable(): boolean {
    return !!process.env.XAI_API_KEY;
  }

  async complete(messages: AiMessage[], options: AiCompletionOptions): Promise<AiCompletionResult> {
    if (!this.isAvailable()) {
      throw new Error('XAI_API_KEY not configured');
    }

    const systemContent = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n');
    const promptHash = createHash('sha256').update(systemContent).digest('hex').slice(0, 16);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);

    const startTime = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.XAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          max_tokens: options.maxTokens,
          temperature: options.temperature,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown');
        throw new Error(`xAI API error ${response.status}: ${errorText}`);
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
        usage: { total_tokens: number };
      };

      const latencyMs = Date.now() - startTime;

      return {
        content: data.choices[0]?.message?.content ?? '',
        tokensUsed: data.usage?.total_tokens ?? 0,
        latencyMs,
        provider: this.name,
        model: this.model,
        promptHash,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export class MockAiProvider implements AiProvider {
  name = 'mock-ai';
  lastMessages: AiMessage[] = [];

  isAvailable(): boolean {
    return true;
  }

  async complete(messages: AiMessage[], _options: AiCompletionOptions): Promise<AiCompletionResult> {
    this.lastMessages = messages;

    const systemContent = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n');
    const promptHash = createHash('sha256').update(systemContent).digest('hex').slice(0, 16);

    return {
      content: 'Resposta simulada do assistente para testes.',
      tokensUsed: 50,
      latencyMs: 10,
      provider: this.name,
      model: 'mock',
      promptHash,
    };
  }
}
