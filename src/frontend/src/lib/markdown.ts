import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Shared markdown renderer — same behavior as the Plugins browser.
marked.setOptions({ breaks: true, gfm: true });

const renderer = new marked.Renderer();
renderer.link = (href, title, text) =>
  `<a href="${href}" target="_blank" rel="noopener noreferrer"${title ? ` title="${title}"` : ''}>${text}</a>`;
renderer.image = (href, title, text) =>
  `<img src="${href}" alt="${text || ''}"${title ? ` title="${title}"` : ''} style="max-width:100%;border-radius:6px;" loading="lazy" />`;
marked.use({ renderer });

// Sanitizer: mod/plugin descriptions and docs come from remote registries
// (Modrinth/Hangar) or from user-editable files — never trust their HTML.
// Allow the formatting tags a README/description needs, strip scripts,
// event handlers (onerror=…) and javascript: URLs, force external links
// to open safely.
const ALLOWED_TAGS = [
  'a', 'b', 'strong', 'i', 'em', 'u', 's', 'del', 'strike', 'code', 'pre',
  'p', 'br', 'hr', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'details', 'summary', 'sup', 'sub', 'span', 'div', 'small', 'kbd',
];
const ALLOWED_ATTR = ['href', 'title', 'src', 'alt', 'target', 'rel', 'colspan', 'rowspan', 'align'];

const PURIFY_CONFIG = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  ALLOW_DATA_ATTR: false,
  // javascript:/data: URLs in href/src are dropped by default; keep it explicit.
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|ftp):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,
};

export function sanitizeHtml(html) {
  return DOMPurify.sanitize(html, PURIFY_CONFIG);
}

export function parseMarkdown(source) {
  if (!source) return '';
  const text = source.length > 20000 ? source.slice(0, 20000) : source;
  // marked escapes nothing — sanitize AFTER parsing so raw HTML embedded in
  // markdown (e.g. <script> in a Modrinth description) is stripped too.
  return sanitizeHtml(marked.parse(text));
}

export { marked };
