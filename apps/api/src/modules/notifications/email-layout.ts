import { escapeHtml } from './format.js';

/** One piece of an email. Each email is written once as blocks, then rendered as text and HTML. */
export type EmailBlock =
  | { readonly kind: 'paragraph'; readonly text: string }
  | { readonly kind: 'table'; readonly rows: readonly (readonly [string, string])[] }
  | { readonly kind: 'button'; readonly label: string; readonly url: string };

export interface EmailContent {
  readonly subject: string;
  readonly blocks: readonly EmailBlock[];
}

export interface RenderedEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export function renderEmail({ subject, blocks }: EmailContent): RenderedEmail {
  return {
    subject,
    text: `${blocks.map(blockText).join('\n\n')}\n`,
    html: page(blocks.map(blockHtml).join('\n')),
  };
}

function blockText(block: EmailBlock): string {
  switch (block.kind) {
    case 'paragraph':
      return block.text;
    case 'table': {
      const width = Math.max(...block.rows.map(([label]) => label.length));
      return block.rows.map(([label, value]) => `${label.padEnd(width)}  ${value}`).join('\n');
    }
    case 'button':
      return `${block.label}:\n${block.url}`;
  }
}

// Inline styles and tables: mail clients ignore most of CSS.
function blockHtml(block: EmailBlock): string {
  switch (block.kind) {
    case 'paragraph':
      return `<p style="margin:0 0 16px">${escapeHtml(block.text)}</p>`;
    case 'table': {
      const rows = block.rows
        .map(
          ([label, value]) =>
            `<tr><td style="padding:4px 16px 4px 0;color:#5b6660">${escapeHtml(label)}</td>` +
            `<td style="padding:4px 0;text-align:right">${escapeHtml(value)}</td></tr>`,
        )
        .join('');
      return `<table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 16px">${rows}</table>`;
    }
    case 'button':
      return (
        `<p style="margin:24px 0"><a href="${escapeHtml(block.url)}" ` +
        `style="display:inline-block;padding:12px 20px;border-radius:6px;background:#b4532f;` +
        `color:#ffffff;text-decoration:none">${escapeHtml(block.label)}</a></p>`
      );
  }
}

function page(body: string): string {
  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8"></head>',
    '<body style="margin:0;padding:24px;background:#f5f1e8;color:#1d2a24;font-family:Georgia,serif;font-size:16px;line-height:1.5">',
    '<div style="max-width:560px;margin:0 auto;padding:32px;background:#ffffff;border-radius:8px">',
    body,
    '</div></body></html>',
  ].join('\n');
}
