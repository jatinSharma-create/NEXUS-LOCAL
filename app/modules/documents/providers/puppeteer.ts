import type { DocumentRenderer, PdfRenderOptions } from '../core/ports';

/** Headless Chromium renderer. Only available in the worker image. */
export class PuppeteerDocumentRenderer implements DocumentRenderer {
  readonly name = 'puppeteer';

  async renderHtmlToPdf(html: string, options: PdfRenderOptions = {}): Promise<Buffer> {
    // Dynamic import so Puppeteer is only loaded in the worker process (not Next.js app).
    const puppeteer = await import('puppeteer-core');

    const executablePath =
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      process.env.CHROMIUM_PATH ||
      '/usr/bin/chromium-browser';

    const browser = await puppeteer.default.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
      ],
    });

    try {
      const page = await browser.newPage();
      // System fonts only — no external @import (avoids hang without outbound network).
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      const pdfBytes = await page.pdf({
        format: options.format ?? 'A4',
        printBackground: options.printBackground ?? true,
      });
      return Buffer.from(pdfBytes);
    } finally {
      await browser.close();
    }
  }
}
