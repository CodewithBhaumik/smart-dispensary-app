/**
 * Minimal single-page PDF writer (Helvetica, WinAnsi) used to create the demo
 * documents attached to seeded medical records. No dependencies.
 */

export interface PdfLine {
  /** Either a single text or table cells [x, text]. */
  text?: string;
  cells?: [number, string][];
  bold?: boolean;
  size?: number;
  muted?: boolean;
  /** Draw a horizontal rule instead of text. */
  rule?: boolean;
  /** Extra space before this line (points). */
  gap?: number;
}

export interface PdfDocument {
  title: string;
  subtitle?: string;
  lines: PdfLine[];
  footer?: string;
}

const escapeText = (s: string) =>
  s
    // keep to Latin-1; replace common unicode punctuation
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/·/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

function textOp(x: number, y: number, text: string, font: 'F1' | 'F2', size: number, color: string): string {
  return `BT /${font} ${size} Tf ${color} rg ${x} ${y} Td (${escapeText(text)}) Tj ET\n`;
}

/** Renders an A4 page and returns the PDF bytes. */
export function buildPdf(doc: PdfDocument): Buffer {
  const W = 595;
  const H = 842;
  const ink = '0.09 0.12 0.18';
  const muted = '0.40 0.45 0.53';
  let content = '';

  // Header band
  content += `q 0.051 0.580 0.533 rg 0 ${H - 92} ${W} 92 re f Q\n`;
  content += textOp(40, H - 48, doc.title, 'F2', 19, '1 1 1');
  if (doc.subtitle) content += textOp(40, H - 70, doc.subtitle, 'F1', 10, '0.85 0.97 0.95');

  let y = H - 125;
  for (const line of doc.lines) {
    y -= line.gap ?? 0;
    if (line.rule) {
      content += `q 0.85 0.88 0.92 RG 0.8 w 40 ${y + 4} m ${W - 40} ${y + 4} l S Q\n`;
      y -= 14;
      continue;
    }
    const size = line.size ?? 10.5;
    const font = line.bold ? 'F2' : 'F1';
    const color = line.muted ? muted : ink;
    if (line.cells) {
      for (const [x, t] of line.cells) content += textOp(x, y, t, font, size, color);
    } else if (line.text !== undefined) {
      content += textOp(40, y, line.text, font, size, color);
    }
    y -= size + 7;
  }

  if (doc.footer) {
    content += `q 0.85 0.88 0.92 RG 0.8 w 40 60 m ${W - 40} 60 l S Q\n`;
    content += textOp(40, 44, doc.footer, 'F1', 8.5, muted);
  }

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}endstream`,
  ];

  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
