/**
 * Centralized OpenRouter LLM client.
 * 
 * All LLM calls go through this module to ensure:
 * - Consistent API configuration
 * - Single point of failure handling
 * - Easy model swapping
 * - Rate limiting (future)
 */

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'xiaomi/mimo-v2-flash:free';
const DEFAULT_REFERER = 'https://polybet.com';

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
}

export interface LLMResponse {
    content: string;
    model: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

/**
 * Call OpenRouter LLM API.
 * 
 * @param messages - Array of messages for the conversation
 * @param options - Optional configuration
 * @returns The assistant's response content, or empty string on failure
 * @throws Never throws - returns empty string on any error
 * 
 * @example
 * const response = await callLLM([
 *   { role: 'user', content: 'Classify this event: Will Bitcoin hit $100k?' }
 * ]);
 */
export async function callLLM(
    messages: LLMMessage[],
    options: LLMCallOptions = {}
): Promise<LLMResponse> {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
        console.warn('[LLM] OPENROUTER_API_KEY not configured');
        return { content: '', model: '' };
    }

    const {
        model = DEFAULT_MODEL,
        maxTokens,
        temperature,
        referer = DEFAULT_REFERER,
    } = options;

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

        if (!res.ok) {
            const errorText = await res.text().catch(() => 'Unknown error');
            console.warn(`[LLM] API request failed: ${res.status} ${res.statusText}`, errorText);
            return { content: '', model };
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

        return {
            content: typeof content === 'string' ? content : '',
            model: json.model ?? model,
            usage,
        };
    } catch (err) {
        console.error('[LLM] API call failed:', err);
        return { content: '', model };
    }
}

/**
 * Simple single-prompt convenience wrapper.
 * 
 * @param prompt - The user prompt to send
 * @param options - Optional configuration
 * @returns Just the content string, or empty string on failure
 * 
 * @example
 * const categories = await promptLLM('List 2 categories for: Bitcoin event');
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
