import LLMService from "./LLMService.js";
import TTSService from "./TTSService.js";
import R2Service from "./R2Service.js";
import Logger from "@utils/logger.js";

interface PodcastInput {
  topic: string;
  voice: "male" | "female" | "british";
  duration: "5min" | "10min" | "15min";
  knowledgeBase?: string;
  userId: string;
}

interface PodcastTurn {
  speaker: "A" | "B";
  text: string;
  audioPath?: string; // R2 URL
}

interface PodcastResult {
  podcastId: string;
  script: PodcastTurn[];
  status: "generating" | "ready" | "failed";
}

class AIPodcastService {
  private r2Service: R2Service;

  constructor() {
    this.r2Service = new R2Service(Logger);
  }

  async generate(input: PodcastInput): Promise<PodcastResult> {
    const podcastId = `podcast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      console.log(`[AI-PODCAST] Generating podcast: ${podcastId}`);
      console.log(`[AI-PODCAST] Topic: ${input.topic}`);
      console.log(`[AI-PODCAST] Duration: ${input.duration}`);

      // Step 1: Generate script with Gemini
      console.log("[AI-PODCAST] Step 1: Generating script with Gemini...");
      const script = await LLMService.generateScript({
        topic: input.topic,
        duration: input.duration,
        knowledgeBase: input.knowledgeBase,
      });

      console.log(`[AI-PODCAST] Script generated with ${script.length} turns`);

      // Step 2: Generate audio for each turn
      console.log("[AI-PODCAST] Step 2: Generating audio with Google TTS...");
      const scriptWithAudio: PodcastTurn[] = [];

      for (let i = 0; i < script.length; i++) {
        const turn = script[i];
        console.log(
          `[AI-PODCAST] Generating audio for turn ${i + 1}/${script.length} (Speaker ${turn.speaker})`,
        );

        // Alternate voices for different speakers
        const voice =
          turn.speaker === "A"
            ? input.voice
            : input.voice === "male"
              ? "female"
              : "male";

        const audioBuffer = await TTSService.synthesize(turn.text, { voice });
        const key = `users/${input.userId}/ai-podcasts/${podcastId}/turn-${i}-speaker-${turn.speaker}.mp3`;
        const audioUrl = await this.r2Service.uploadBuffer(
          audioBuffer,
          key,
          "audio/mpeg",
        );

        scriptWithAudio.push({
          ...turn,
          audioPath: audioUrl,
        });
      }

      console.log(`[AI-PODCAST] Podcast generated successfully: ${podcastId}`);

      return {
        podcastId,
        script: scriptWithAudio,
        status: "ready",
      };
    } catch (error) {
      console.error(`[AI-PODCAST] Generation failed:`, error);
      throw error;
    }
  }
}

export default new AIPodcastService();
