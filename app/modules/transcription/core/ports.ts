import type { NamedProvider } from '@/modules/shared/registry';

export type TranscribeInput = {
  buffer: Buffer;
  /** audio/mpeg | audio/wav */
  mimeType: string;
  filename: string;
};

export type TranscribeResult = {
  text: string;
  provider: string;
  model: string;
};

/**
 * Turn recorded call audio into text. Whisper, Deepgram, AssemblyAI, a Gemini
 * multimodal prompt or a local model all fit behind this.
 */
export interface TranscriptionProvider extends NamedProvider {
  transcribe(input: TranscribeInput): Promise<TranscribeResult>;
}
