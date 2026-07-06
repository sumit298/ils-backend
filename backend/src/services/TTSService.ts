import * as textToSpeech from '@google-cloud/text-to-speech';
import fs from 'fs';
import path from 'path';
import util from 'util';

interface TTSOptions {
  voice: 'male' | 'female' | 'british';
  languageCode?: string;
}

class TTSService {
  private client: textToSpeech.TextToSpeechClient;

  constructor() {
    this.client = new textToSpeech.TextToSpeechClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });
  }

  private getVoiceName(voice: 'male' | 'female' | 'british'): string {
    const voices = {
      male: 'en-US-Neural2-D',
      female: 'en-US-Neural2-C',
      british: 'en-GB-Neural2-B',
    };
    return voices[voice];
  }

  async synthesize(
    text: string,
    options: TTSOptions = { voice: 'male' }
  ): Promise<Buffer> {
    const request = {
      input: { text },
      voice: {
        languageCode: options.languageCode || 'en-US',
        name: this.getVoiceName(options.voice),
      },
      audioConfig: {
        audioEncoding: 'MP3' as const,
        speakingRate: 1.0,
        pitch: 0,
      },
    };

    const [response] = await this.client.synthesizeSpeech(request);

    if (!response.audioContent) {
      throw new Error('No audio content generated');
    }

    return Buffer.from(response.audioContent as Uint8Array);
  }

  async synthesizeForStreaming(
    text: string,
    options: TTSOptions = { voice: 'male' }
  ): Promise<Buffer> {
    const request = {
      input: { text },
      voice: {
        languageCode: options.languageCode || "en-US",
        name: this.getVoiceName(options.voice),
      },
      audioConfig: {
        audioEncoding: 'LINEAR16' as const,
        sampleRateHertz: 48000,
        audioChannelCount: 1,
        speakingRate: 1.0,
        pitch: 0,
      }
    };
    const [response] = await this.client.synthesizeSpeech(request);
    if(!response.audioContent) {
      throw new Error('No audio content generated');
    }
    return Buffer.from(response.audioContent as Uint8Array);
  }

  async synthesizeToFile(
    text: string,
    outputPath: string,
    options: TTSOptions = { voice: 'male' }
  ): Promise<string> {
    const audioBuffer = await this.synthesize(text, options);
    
    const writeFile = util.promisify(fs.writeFile);
    await writeFile(outputPath, audioBuffer);
    
    return outputPath;
  }
}

export default new TTSService();
