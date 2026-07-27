export interface PdfCallData {
  candidateName: string;
  candidatePhone?: string | null;
  callDate: string;
  durationSeconds?: number | null;
  direction: string;
  summary: string;
  keyPoints: string[];
  nextSteps: string[];
  sentiment?: string | null;
  transcript: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sentimentColor(sentiment?: string | null): string {
  if (sentiment === 'positive') return '#16a34a';
  if (sentiment === 'negative') return '#dc2626';
  return '#d97706';
}

function formatDuration(secs?: number | null): string {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
}

function buildHtml(data: PdfCallData): string {
  const name = escapeHtml(data.candidateName);
  const phone = data.candidatePhone ? escapeHtml(data.candidatePhone) : null;
  const callDate = escapeHtml(data.callDate);
  const direction = escapeHtml(
    data.direction.charAt(0).toUpperCase() + data.direction.slice(1)
  );
  const summary = escapeHtml(data.summary);
  const transcript = escapeHtml(data.transcript);
  const sentiment = data.sentiment ? escapeHtml(data.sentiment) : null;

  const sentimentBadge = sentiment
    ? `<span style="color:${sentimentColor(data.sentiment)};font-weight:600;text-transform:capitalize">${sentiment}</span>`
    : '';

  const keyPointsHtml = data.keyPoints
    .map((p) => `<li>${escapeHtml(p)}</li>`)
    .join('');

  const nextStepsHtml = data.nextSteps
    .map((s) => `<li>${escapeHtml(s)}</li>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Call Transcript — ${name}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: DejaVu Sans, Liberation Sans, FreeSans, Arial, sans-serif;
      font-size: 11pt;
      color: #1c1917;
      background: #fff;
      padding: 0;
    }
    .page { padding: 40px 52px; }
    .header {
      border-bottom: 3px solid #f59e0b;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }
    .header-logo {
      font-size: 13pt;
      font-weight: 700;
      color: #92400e;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-bottom: 10px;
    }
    h1 { font-size: 22pt; font-weight: 700; color: #1c1917; }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 24px;
      margin-top: 12px;
      font-size: 10pt;
      color: #57534e;
    }
    .meta span b { color: #1c1917; font-weight: 600; }
    section { margin-bottom: 28px; }
    h2 {
      font-size: 9pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #b45309;
      margin-bottom: 10px;
      padding-bottom: 4px;
      border-bottom: 1px solid #fde68a;
    }
    .summary-box {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 6px;
      padding: 14px 18px;
      font-size: 11pt;
      line-height: 1.6;
      color: #1c1917;
      white-space: pre-wrap;
    }
    ul { padding-left: 20px; }
    ul li {
      margin-bottom: 6px;
      line-height: 1.5;
    }
    .transcript-box {
      background: #f5f5f4;
      border: 1px solid #d6d3d1;
      border-radius: 6px;
      padding: 16px 18px;
      font-family: DejaVu Sans Mono, Liberation Mono, FreeMono, monospace;
      font-size: 9.5pt;
      line-height: 1.7;
      white-space: pre-wrap;
      word-break: break-word;
      color: #292524;
    }
    .footer {
      margin-top: 32px;
      padding-top: 12px;
      border-top: 1px solid #e7e5e4;
      font-size: 8.5pt;
      color: #a8a29e;
      text-align: center;
    }
    @page { margin: 20mm 15mm; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="header-logo">Nexus Recruiting</div>
      <h1>${name}</h1>
      <div class="meta">
        ${phone ? `<span><b>Phone:</b> ${phone}</span>` : ''}
        <span><b>Date:</b> ${callDate}</span>
        <span><b>Duration:</b> ${formatDuration(data.durationSeconds)}</span>
        <span><b>Direction:</b> ${direction}</span>
        ${sentiment ? `<span><b>Sentiment:</b> ${sentimentBadge}</span>` : ''}
      </div>
    </div>

    <section>
      <h2>Executive Summary</h2>
      <div class="summary-box">${summary}</div>
    </section>

    ${data.keyPoints.length > 0 ? `
    <section>
      <h2>Key Discussion Points</h2>
      <ul>${keyPointsHtml}</ul>
    </section>` : ''}

    ${data.nextSteps.length > 0 ? `
    <section>
      <h2>Next Steps</h2>
      <ul>${nextStepsHtml}</ul>
    </section>` : ''}

    <section>
      <h2>Full Transcript</h2>
      <div class="transcript-box">${transcript}</div>
    </section>

    <div class="footer">
      Generated by Nexus Recruiting &mdash; Confidential &mdash; ${callDate}
    </div>
  </div>
</body>
</html>`;
}

export async function generateCallPdfBuffer(data: PdfCallData): Promise<Buffer> {
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
    await page.setContent(buildHtml(data), { waitUntil: 'domcontentloaded' });
    const pdfBytes = await page.pdf({ format: 'A4', printBackground: true });
    return Buffer.from(pdfBytes);
  } finally {
    await browser.close();
  }
}
