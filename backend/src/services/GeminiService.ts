import { GoogleGenAI } from '@google/genai';

interface ScriptTurn {
  speaker: 'A' | 'B';
  text: string;
}

interface GenerateScriptOptions {
  topic: string;
  duration: '5min' | '10min' | '15min';
  knowledgeBase?: string;
}

class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not found in environment variables');
    }
    
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  private getTurnCount(duration: string): number {
    const counts = {
      '5min': 10,
      '10min': 18,
      '15min': 26,
    };
    return counts[duration as keyof typeof counts] || 10;
  }

  async generateScript(options: GenerateScriptOptions): Promise<ScriptTurn[]> {
    const turnCount = this.getTurnCount(options.duration);
    
    const prompt = `
You are a professional podcast script writer. Generate a natural, engaging ${options.duration} conversation between two podcast hosts (Host A and Host B) about: "${options.topic}"

${options.knowledgeBase ? `
IMPORTANT - Use this knowledge base as your primary source:
${options.knowledgeBase}

Stay strictly within the provided context. Do not add external information.
` : ''}

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

Return ONLY the JSON array, no other text.
`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    const text = response.text;
    
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text?.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Failed to parse script from Gemini response');
    }
    
    const script: ScriptTurn[] = JSON.parse(jsonMatch[0]);
    
    // Validate script structure
    if (!Array.isArray(script) || script.length === 0) {
      throw new Error('Invalid script format');
    }
    
    return script;
  }

  async generateRaw(prompt:string): Promise<string> {
    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const text = response.text?.trim() || '';
    if (!text) {
      throw new Error('Failed to generate content from Gemini');
    }

    return text;
  }
}

export default new GeminiService();
