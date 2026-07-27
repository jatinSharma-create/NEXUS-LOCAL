import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { SttProvider, TranscribeInput, TranscribeResult } from './types';

export class GeminiSttProvider implements SttProvider {
  name = 'gemini';

  async transcribe(input: TranscribeInput): Promise<TranscribeResult> {
    const modelName = process.env.GOOGLE_GENERATIVE_AI_MODEL || 'gemini-2.5-flash-lite';

    const { text } = await generateText({
      model: google(modelName),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Please transcribe the following audio recording verbatim. Output only the transcript text without any commentary.',
            },
            {
              type: 'file',
              data: input.buffer,
              mediaType: input.mimeType,
            },
          ],
        },
      ],
    });

    return {
      text: text.trim(),
      provider: 'gemini',
      model: modelName,
    };
  }
}
