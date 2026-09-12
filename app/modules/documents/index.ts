import { createRegistry } from '@/modules/shared/registry';
import type { DocumentRenderer } from './core/ports';
import { PuppeteerDocumentRenderer } from './providers/puppeteer';
import {
  buildCallTranscriptHtml,
  type CallTranscriptDocument,
} from './templates/call-transcript';

const registry = createRegistry<DocumentRenderer>('documents');

registry.register('puppeteer', () => new PuppeteerDocumentRenderer());

export function getDocumentRenderer(): DocumentRenderer {
  return registry.resolve(process.env.PDF_RENDERER || 'puppeteer');
}

/** Render the call transcript PDF: template builds the HTML, provider prints it. */
export function generateCallTranscriptPdf(data: CallTranscriptDocument): Promise<Buffer> {
  return getDocumentRenderer().renderHtmlToPdf(buildCallTranscriptHtml(data));
}

export type { DocumentRenderer, PdfRenderOptions } from './core/ports';
export type { CallTranscriptDocument } from './templates/call-transcript';
export const availableDocumentRenderers = registry.names;
