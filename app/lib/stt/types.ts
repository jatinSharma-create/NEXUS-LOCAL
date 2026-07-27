export type TranscribeInput = {
  buffer: Buffer;
  mimeType: string; // audio/mpeg | audio/wav
  filename: string;
};

export type TranscribeResult = {
  text: string;
  provider: string;
  model: string;
};

export interface SttProvider {
  name: string;
  transcribe(input: TranscribeInput): Promise<TranscribeResult>;
}
