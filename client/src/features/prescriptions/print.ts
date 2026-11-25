/**
 * Prints a single element in isolation: the element's HTML plus the app's
 * stylesheets are copied into a hidden iframe, so only that card is printed
 * (works for cards rendered inside dialogs/portals too).
 */
export function printElement(element: HTMLElement, title = 'Smart Dispensary'): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.title = 'print-frame';
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
    visibility: 'hidden',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    window.print();
    return;
  }

  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((node) => node.outerHTML)
    .join('\n');

  const safeTitle = title.replace(/[<>&"]/g, '');
  doc.open();
  doc.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <base href="${window.location.origin}/" />
    <title>${safeTitle}</title>
    ${styles}
    <style>
      @page { size: A4; margin: 12mm; }
      html, body { background: #ffffff !important; }
      body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      [data-print-root] { box-shadow: none !important; max-width: 100% !important; }
      [data-print-hide] { display: none !important; }
    </style>
  </head>
  <body>${element.outerHTML}</body>
</html>`);
  doc.close();

  let printed = false;
  const run = () => {
    if (printed) return;
    printed = true;
    try {
      win.focus();
      win.print();
    } finally {
      window.setTimeout(() => iframe.remove(), 1500);
    }
  };
  // Give stylesheets and fonts a moment to load inside the frame.
  iframe.addEventListener('load', () => window.setTimeout(run, 250));
  window.setTimeout(run, 1200);
}
