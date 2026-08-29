export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiCompletionOptions {
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
}

export interface AiCompletionResult {
  content: string;
  tokensUsed: number;
  latencyMs: number;
  provider: string;
  model: string;
  promptHash: string;
}

export interface AiProvider {
  name: string;
  isAvailable(): boolean;
  complete(messages: AiMessage[], options: AiCompletionOptions): Promise<AiCompletionResult>;
}

export interface AiCostLimits {
  maxTokensPerRequest: number;
  maxRequestsPerHour: number;
  maxCostCentsPerDay: number;
}

const DEFAULT_LIMITS: AiCostLimits = {
  maxTokensPerRequest: 2000,
  maxRequestsPerHour: 100,
  maxCostCentsPerDay: 500,
};

export function getDefaultLimits(): AiCostLimits {
  return { ...DEFAULT_LIMITS };
}
