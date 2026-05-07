import type { LLMMessage } from "./types";

export class LLMClient {
	private endpoint: string;
	private apiKey: string;
	private model: string;

	constructor(endpoint: string, apiKey: string, model: string = "glm-5") {
		this.endpoint = normalizeChatEndpoint(endpoint);
		this.apiKey = apiKey;
		this.model = model || "glm-5";
	}

	async chat(messages: LLMMessage[], model: string = this.model): Promise<string> {
		const resp = await fetch(this.endpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify({ model, messages, temperature: 0.3 }),
		});

		if (!resp.ok) {
			const text = await resp.text();
			throw new Error(`LLM API error ${resp.status}: ${text}`);
		}

		const data = await resp.json() as any;
		return data.choices?.[0]?.message?.content || "";
	}

	async chatWithRetry(messages: LLMMessage[], retries: number = 3, model: string = this.model): Promise<string> {
		let lastError: Error | null = null;
		for (let i = 0; i < retries; i++) {
			try {
				return await this.chat(messages, model);
			} catch (err) {
				lastError = err instanceof Error ? err : new Error(String(err));
				if (i < retries - 1) {
					await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
				}
			}
		}
		throw lastError!;
	}
}

function normalizeChatEndpoint(endpoint: string): string {
	const trimmed = endpoint.trim().replace(/\/+$/, "");
	if (trimmed.endsWith("/chat/completions")) return trimmed;
	return `${trimmed}/chat/completions`;
}
