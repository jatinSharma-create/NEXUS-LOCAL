import { SttProvider } from './types';
import { GroqSttProvider } from './groq';
import { GeminiSttProvider } from './gemini';

export function getSttProvider(): SttProvider {
  const provider = (process.env.STT_PROVIDER || 'groq').toLowerCase();
  if (provider === 'gemini') {
    return new GeminiSttProvider();
  }
  return new GroqSttProvider();
}

export * from './types';
