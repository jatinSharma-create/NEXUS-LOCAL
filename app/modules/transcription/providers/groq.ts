import { File as NodeFile } from 'node:buffer';
import Groq, { toFile } from 'groq-sdk';
import type { TranscribeInput, TranscribeResult, TranscriptionProvider } from '../core/ports';

// groq-sdk requires global File (Node 20+). Polyfill for older runtimes.
if (typeof globalThis.File === 'undefined') {
  globalThis.File = NodeFile as typeof globalThis.File;
}

export class GroqTranscriptionProvider implements TranscriptionProvider {
  readonly name = 'groq';

  async transcribe(input: TranscribeInput): Promise<TranscribeResult> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is required for Groq STT provider');
    }
    const model = process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo';

    const groq = new Groq({ apiKey });
    const file = await toFile(input.buffer, input.filename, { type: input.mimeType });

    const response = await groq.audio.transcriptions.create({
      file,
      model,
      response_format: 'json',
    });

    return {
      text: response.text,
      provider: this.name,
      model,
    };
  }
}
