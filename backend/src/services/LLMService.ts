import { GoogleGenAI } from "@google/genai";

// LLM_PROVIDER=gemini (default) | ollama
// LLM_MODEL=gemini-2.0-flash | llama3.2 | mistral | etc.
// OLLAMA_BASE_URL=http://localhost:11434 (default)

type Provider = "gemini" | "ollama";

interface ScriptTurn {
  speaker: "A" | "B";
  text: string;
}

interface GenerateScriptOptions {
  topic: string;
  duration: "5min" | "10min" | "15min";
  knowledgeBase?: string;
}

class LLMService {
  private provider: Provider;
  private model: string;
  private ollamaBaseUrl: string;
  private geminiAI: GoogleGenAI | null = null;
  private requestTimeoutMs: number;

  constructor() {
    this.provider = (process.env.LLM_PROVIDER as Provider) || "gemini";
    this.ollamaBaseUrl =
      process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    this.requestTimeoutMs = this.getRequestTimeoutMs();

    if (this.provider === "ollama") {
      this.model = process.env.LLM_MODEL || "llama3.2";
    } else {
      // gemini default — use 2.0-flash for high-frequency calls (AI streamer)
      this.model = process.env.LLM_MODEL || "gemini-2.0-flash";
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY not found in environment variables");
      }
      this.geminiAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
  }

  private async callGemini(prompt: string): Promise<string> {
    if (!this.geminiAI) throw new Error("Gemini client not initialized");
    const response = await this.geminiAI.models.generateContent({
      model: this.model,
      contents: prompt,
      config: {
        httpOptions: { timeout: this.requestTimeoutMs },
      },
    });
    const text = response.text?.trim() || "";
    if (!text) throw new Error("Empty response from Gemini");
    return text;
  }

  private async callOllama(prompt: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.requestTimeoutMs,
    );

    let response: Response;
    try {
      response = await fetch(`${this.ollamaBaseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
        }),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(
          `Ollama request timed out after ${this.requestTimeoutMs}ms`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(
        `Ollama request failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as { response: string };
    const text = data.response?.trim() || "";
    if (!text) throw new Error("Empty response from Ollama");
    return text;
  }

  async generateRaw(prompt: string): Promise<string> {
    if (this.provider === "ollama") return this.callOllama(prompt);
    return this.callGemini(prompt);
  }

  private getRequestTimeoutMs(): number {
    const timeout = Number(process.env.LLM_REQUEST_TIMEOUT_MS || 120000);
    if (!Number.isFinite(timeout) || timeout <= 0) {
      throw new Error("LLM_REQUEST_TIMEOUT_MS must be a positive number");
    }
    return timeout;
  }

  private getTurnCount(duration: string): number {
    const counts = { "5min": 11, "10min": 19, "15min": 27 };
    return counts[duration as keyof typeof counts] || 10;
  }

  async generateScript(options: GenerateScriptOptions): Promise<ScriptTurn[]> {
    const turnCount = this.getTurnCount(options.duration);

    const prompt = `You are a professional podcast script writer. Generate a natural, engaging ${options.duration} conversation between two podcast hosts (Host A and Host B) about: "${options.topic}"

${options.knowledgeBase ? `IMPORTANT - Use this knowledge base as your primary source:\n${options.knowledgeBase}\n\nStay strictly within the provided context. Do not add external information.\n` : ""}
Requirements:
- Exactly ${turnCount} turns total (alternating between speakers)
- Each turn should be 2-4 sentences
- Conversational and natural tone
- Host A introduces the topic
- Host B responds and adds insights
- Build on each other's points
- End with a conclusion from Host A

Format your response as a JSON array with this structure:
[
  { "speaker": "A", "text": "Welcome to today's episode! We're diving into ${options.topic}..." },
  { "speaker": "B", "text": "Thanks for having me! This is such a fascinating topic..." },
  ...
]

Return ONLY the JSON array, no other text.`;

    // For script generation always use gemini-2.5-flash if on gemini provider
    // (better structured output), override model temporarily
    let text: string;
    if (this.provider === "gemini" && this.geminiAI) {
      const response = await this.geminiAI.models.generateContent({
        model: process.env.LLM_MODEL || "gemini-3.1-flash-lite",
        contents: prompt,
        config: {
          httpOptions: { timeout: this.requestTimeoutMs },
        },
      });
      text = response.text?.trim() || "";
    } else {
      text = await this.generateRaw(prompt);
    }

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("Failed to parse script from LLM response");

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      throw new Error("Failed to parse script JSON from LLM response");
    }

    if (!Array.isArray(parsed) || parsed.length !== turnCount) {
      throw new Error("Invalid script format");
    }

    return parsed.map((turn, index): ScriptTurn => {
      const expectedSpeaker: ScriptTurn["speaker"] =
        index % 2 === 0 ? "A" : "B";
      if (typeof turn !== "object" || turn === null) {
        throw new Error("Invalid script turn format");
      }

      const { speaker, text } = turn as { speaker?: unknown; text?: unknown };
      if (
        speaker !== expectedSpeaker ||
        typeof text !== "string" ||
        !text.trim()
      ) {
        throw new Error("Invalid script turn format");
      }

      return { speaker: expectedSpeaker, text: text.trim() };
    });
  }
}

export default new LLMService();
