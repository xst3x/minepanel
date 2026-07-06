import { marked } from 'marked';

// Shared markdown renderer — same behavior as the Plugins browser.
marked.setOptions({ breaks: true, gfm: true });

const renderer = new marked.Renderer();
renderer.link = (href, title, text) =>
  `<a href="${href}" target="_blank" rel="noopener noreferrer"${title ? ` title="${title}"` : ''}>${text}</a>`;
renderer.image = (href, title, text) =>
  `<img src="${href}" alt="${text || ''}"${title ? ` title="${title}"` : ''} style="max-width:100%;border-radius:6px;" loading="lazy" />`;
marked.use({ renderer });

export function parseMarkdown(source) {
  if (!source) return '';
  const text = source.length > 20000 ? source.slice(0, 20000) : source;
  return marked.parse(text);
}

export { marked };
