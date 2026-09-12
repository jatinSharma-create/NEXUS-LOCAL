import type { NamedProvider } from '@/modules/shared/registry';

export interface PdfRenderOptions {
  format?: 'A4' | 'Letter';
  printBackground?: boolean;
}

/**
 * Turn an HTML document into PDF bytes.
 *
 * Kept deliberately narrow so the engine is swappable: headless Chromium
 * today, a hosted rendering API or a pure-JS generator tomorrow. Document
 * *content* lives in `templates/`, not here.
 */
export interface DocumentRenderer extends NamedProvider {
  renderHtmlToPdf(html: string, options?: PdfRenderOptions): Promise<Buffer>;
}
