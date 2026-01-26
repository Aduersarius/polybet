import { promptLLM } from './llm';

/**
 * Generate a human-readable URL slug for an event using LLM.
 * Example: "Israel strikes Iran by Jan 31" -> "israel-strikes-iran-jan31"
 */
export async function generateSlugWithLLM(title: string, resolutionDate: Date): Promise<string> {
    try {
        const dateStr = resolutionDate?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) || '';
        const prompt = `Create a short, SEO-friendly, human-readable URL slug for this event:
Title: "${title}"
${dateStr ? `Context Date: ${dateStr}` : ''}

Requirements:
- Use lowercase alphanumeric characters and hyphens only
- Maximum 5 words
- DO NOT include the date unless it is explicitly mentioned in the title (e.g. "Will Trump win in 2024?") or is absolutely critical to distinguish the event.
- If the title is generic (e.g. "Will price go up?"), describe the subject.
- Return ONLY the slug string, no explanation or quotes`;

        const content = await promptLLM(prompt, { maxTokens: 50, operation: 'generate_slug' });
        if (!content) throw new Error('No content returned from LLM');

        const slug = content.trim()
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');

        console.log(`[LLM] Generated slug for "${title.slice(0, 30)}...": "${slug}"`);
        return slug;
    } catch (err) {
        console.warn("[LLM] Slug generation failed, using fallback", err);
        // Fallback: strict sanitization of title
        return title.trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphen
            .replace(/^-+|-+$/g, '');     // Trim leading/trailing hyphens
    }
}
