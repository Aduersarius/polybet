/**
 * Centralized OpenRouter LLM client with Sentry Monitoring.
 * 
 * All LLM calls go through this module to ensure:
 * - Consistent API configuration
 * - Sentry tracing with spans for each LLM call
 * - Metrics tracking (latency, token usage, errors)
 * - Single point of failure handling
 * - Easy model swapping
 */

import { trace, Span, SpanStatusCode } from '@opentelemetry/api';
import { trackExternalApi, trackError } from '@/lib/metrics';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'xiaomi/mimo-v2-flash:free';
const DEFAULT_REFERER = 'https://pariflow.com';

export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface LLMCallOptions {
    /** Model to use. Defaults to xiaomi/mimo-v2-flash:free */
    model?: string;
    /** Maximum tokens to generate */
    maxTokens?: number;
    /** Temperature for response randomness (0-2) */
    temperature?: number;
    /** Custom HTTP-Referer header */
    referer?: string;
    /** Operation name for tracing (e.g., 'categorize', 'summarize') */
    operation?: string;
}

export interface LLMResponse {
    content: string;
    model: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    durationMs?: number;
}

export async function callLLM(
    messages: LLMMessage[],
    options: LLMCallOptions = {}
): Promise<LLMResponse> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const startTime = performance.now();

    if (!apiKey) {
        console.warn('[LLM] OPENROUTER_API_KEY not configured');
        return { content: '', model: '' };
    }

    const {
        model = DEFAULT_MODEL,
        maxTokens,
        temperature,
        referer = DEFAULT_REFERER,
        operation = 'llm_call',
    } = options;

    const tracer = trace.getTracer('pariflow-app');

    return tracer.startActiveSpan(`LLM: ${operation}`, {
        attributes: {
            'ai.model': model,
            'ai.operation': operation,
            'ai.provider': 'openrouter',
            'ai.messages_count': messages.length,
            'ai.prompt_preview': messages[messages.length - 1]?.content?.substring(0, 200) || '',
        }
    }, async (span: Span) => {
        let attempts = 0;
        const maxRetries = 2; // Total 3 attempts
        let lastError: Error | null = null;
        let lastStatus: number | null = null;

        while (attempts <= maxRetries) {
            attempts++;
            try {
                const body: Record<string, unknown> = {
                    model,
                    messages,
                };

                if (maxTokens !== undefined) body.max_tokens = maxTokens;
                if (temperature !== undefined) body.temperature = temperature;

                const res = await fetch(OPENROUTER_API_URL, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': referer,
                    },
                    body: JSON.stringify(body),
                });

                const durationMs = performance.now() - startTime;

                if (!res.ok) {
                    lastStatus = res.status;
                    const errorText = await res.text().catch(() => 'Unknown error');

                    // Retry on 429 (Rate Limit) or 5xx (Server Error)
                    if (attempts <= maxRetries && (res.status === 429 || res.status >= 500)) {
                        console.warn(`[LLM] API attempt ${attempts} failed (${res.status}), retrying...`);
                        const delay = Math.min(1000 * Math.pow(2, attempts - 1), 5000);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }

                    console.warn('[LLM] API request failed: %s %s', res.status, res.statusText, errorText);

                    span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${res.status}` });
                    span.setAttribute('ai.error', errorText.substring(0, 500));

                    trackExternalApi('openrouter', operation, durationMs, false);
                    trackError(new Error(`OpenRouter API error: ${res.status}`), {
                        model,
                        operation,
                        statusCode: res.status,
                        errorText: errorText.substring(0, 1000)
                    });

                    return { content: '', model, durationMs };
                }

                const json = await res.json();
                const content = json.choices?.[0]?.message?.content ?? '';
                const usage = json.usage
                    ? {
                        promptTokens: json.usage.prompt_tokens ?? 0,
                        completionTokens: json.usage.completion_tokens ?? 0,
                        totalTokens: json.usage.total_tokens ?? 0,
                    }
                    : undefined;

                span.setStatus({ code: SpanStatusCode.OK });
                span.setAttribute('ai.response_length', content.length);
                if (usage) {
                    span.setAttribute('ai.prompt_tokens', usage.promptTokens);
                    span.setAttribute('ai.completion_tokens', usage.completionTokens);
                    span.setAttribute('ai.total_tokens', usage.totalTokens);
                }

                trackExternalApi('openrouter', operation, durationMs, true);

                return {
                    content: typeof content === 'string' ? content : '',
                    model: json.model ?? model,
                    usage,
                    durationMs,
                };
            } catch (err) {
                lastError = err as Error;
                // Retry on network errors
                if (attempts <= maxRetries) {
                    console.warn(`[LLM] Network attempt ${attempts} failed, retrying...`, err);
                    const delay = Math.min(1000 * Math.pow(2, attempts - 1), 5000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
            }
        }

        // Final failure handling after retries exhausted
        const durationMs = performance.now() - startTime;
        console.error('[LLM] All API attempts failed:', lastError);

        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Exception' });
        if (lastError) span.recordException(lastError);

        trackError(lastError || new Error('Unknown LLM error'), { model, operation, messageCount: messages.length });
        trackExternalApi('openrouter', operation, durationMs, false);

        return { content: '', model: model || '', durationMs };
    });
}

/**
 * Simple single-prompt convenience wrapper with Sentry monitoring.
 * 
 * @param prompt - The user prompt to send
 * @param options - Optional configuration
 * @returns Just the content string, or empty string on failure
 * 
 * @example
 * const categories = await promptLLM('List 2 categories for: Bitcoin event', { operation: 'categorize' });
 */
export async function promptLLM(
    prompt: string,
    options: LLMCallOptions = {}
): Promise<string> {
    const response = await callLLM(
        [{ role: 'user', content: prompt }],
        options
    );
    return response.content;
}

/**
 * Get LLM completion with system prompt.
 * 
 * @param systemPrompt - System instruction for the model
 * @param userPrompt - User's request
 * @param options - Optional configuration
 */
export async function completeLLM(
    systemPrompt: string,
    userPrompt: string,
    options: LLMCallOptions = {}
): Promise<LLMResponse> {
    return callLLM(
        [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        options
    );
}
