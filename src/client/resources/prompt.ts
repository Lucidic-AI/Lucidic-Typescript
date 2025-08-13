import { HttpClient } from '../httpClient';

export class PromptResource {
  private cache = new Map<string, { prompt: string; exp: number }>();
  constructor(private http: HttpClient, private agentId: string) {}

  async getRawPrompt(promptName: string, cacheTtl = 300, label = 'production'): Promise<string> {
    const key = `${promptName}:${label}`;
    const now = Date.now() / 1000;
    const cached = this.cache.get(key);
    if (cached && (cached.exp === Infinity || cached.exp > now)) return cached.prompt;

    const res = await this.http.get<{ prompt_content: string }>('getprompt', {
      agent_id: this.agentId,
      prompt_name: promptName,
      label,
    });
    const prompt = res.prompt_content;
    let exp = 0;
    if (cacheTtl !== 0) exp = cacheTtl === -1 ? Infinity : now + cacheTtl;
    this.cache.set(key, { prompt, exp });
    return prompt;
  }

  // Replace variables like {{var}} with values
  substituteVariables(prompt: string, variables?: Record<string, any>): string {
    let out = prompt;
    if (variables) {
      for (const [k, v] of Object.entries(variables)) {
        const needle = `{{${k}}}`;
        out = out.split(needle).join(String(v));
      }
    }
    return out;
  }

  // Convenience: fetch prompt and substitute variables
  async getPrompt(
    promptName: string,
    variables?: Record<string, any>,
    cacheTtl = 300,
    label = 'production',
  ): Promise<string> {
    const raw = await this.getRawPrompt(promptName, cacheTtl, label);
    return this.substituteVariables(raw, variables);
  }
}

