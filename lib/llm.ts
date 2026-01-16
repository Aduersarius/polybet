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

import * as Sentry from '@sentry/nextjs';
import { trackExternalApi } from './sentry-metrics';

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

/**
 * Call OpenRouter LLM API with Sentry monitoring.
 * 
 * @param messages - Array of messages for the conversation
 * @param options - Optional configuration
 * @returns The assistant's response content, or empty string on failure
 * @throws Never throws - returns empty string on any error
 * 
 * @example
 * const response = await callLLM([
 *   { role: 'user', content: 'Classify this event: Will Bitcoin hit $100k?' }
 * ], { operation: 'categorize' });
 */
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

    // Create a Sentry span for this LLM call
    return Sentry.startSpan(
        {
            name: `LLM: ${operation}`,
            op: 'ai.call',
            attributes: {
                'ai.model': model,
                'ai.operation': operation,
                'ai.provider': 'openrouter',
                'ai.messages_count': messages.length,
                // Capture first 200 chars of the prompt for debugging (configurable)
                'ai.prompt_preview': messages[messages.length - 1]?.content?.substring(0, 200) || '',
            },
        },
        async (span) => {
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
                    const errorText = await res.text().catch(() => 'Unknown error');
                    console.warn('[LLM] API request failed: %s %s', res.status, res.statusText, errorText);

                    // Track error in Sentry
                    span.setStatus({ code: 2, message: `HTTP ${res.status}` }); // Error status
                    span.setAttribute('ai.error', errorText.substring(0, 500));
                    trackExternalApi('openrouter', operation, durationMs, false);

                    // Capture as exception for visibility
                    Sentry.captureException(new Error(`OpenRouter API error: ${res.status}`), {
                        extra: {
                            model,
                            operation,
                            statusCode: res.status,
                            errorText: errorText.substring(0, 1000),
                        },
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

                // Set successful span attributes
                span.setStatus({ code: 1 }); // OK status
                span.setAttribute('ai.response_length', content.length);
                if (usage) {
                    span.setAttribute('ai.prompt_tokens', usage.promptTokens);
                    span.setAttribute('ai.completion_tokens', usage.completionTokens);
                    span.setAttribute('ai.total_tokens', usage.totalTokens);
                }

                // Track success metrics
                trackExternalApi('openrouter', operation, durationMs, true);

                // Track token usage as distribution metric
                if (usage) {
                    Sentry.metrics.distribution('llm.tokens_used', usage.totalTokens, {
                        attributes: { model, operation },
                    });
                    Sentry.metrics.distribution('llm.prompt_tokens', usage.promptTokens, {
                        attributes: { model },
                    });
                    Sentry.metrics.distribution('llm.completion_tokens', usage.completionTokens, {
                        attributes: { model },
                    });
                }

                // Track latency
                Sentry.metrics.distribution('llm.latency', durationMs, {
                    unit: 'millisecond',
                    attributes: { model, operation },
                });

                return {
                    content: typeof content === 'string' ? content : '',
                    model: json.model ?? model,
                    usage,
                    durationMs,
                };
            } catch (err) {
                const durationMs = performance.now() - startTime;
                console.error('[LLM] API call failed:', err);

                // Capture exception with context
                span.setStatus({ code: 2, message: 'Exception' });
                Sentry.captureException(err, {
                    extra: {
                        model,
                        operation,
                        messageCount: messages.length,
                    },
                });

                trackExternalApi('openrouter', operation, durationMs, false);

                return { content: '', model, durationMs };
            }
        }
    );
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
