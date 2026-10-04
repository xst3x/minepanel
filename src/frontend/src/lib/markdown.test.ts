import { describe, expect, it } from 'vitest';
import { parseMarkdown, sanitizeHtml } from './markdown';

describe('untrusted descriptions and docs', () => {
  it('removes executable markup and unsafe URLs after markdown parsing', () => {
    const html = parseMarkdown('<script>alert(1)</script><img src="https://example.com/skin.png" onerror="alert(1)"><a href="javascript:alert(1)">unsafe</a><svg onload="alert(1)"></svg>');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('script, svg, [onerror], [onload], a[href]')).toBeNull();
    expect(doc.querySelector('img')?.getAttribute('src')).toBe('https://example.com/skin.png');
  });
  it('preserves normal descriptions, formatting and safe external links', () => {
    const html = parseMarkdown('## Example plugin\n\n**Features** and [documentation](https://example.com/docs)\n\n- First feature\n- Second feature');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('h2')?.textContent).toBe('Example plugin');
    expect(doc.querySelector('strong')?.textContent).toBe('Features');
    expect(doc.querySelectorAll('li')).toHaveLength(2);
    expect(doc.querySelector('a')?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(sanitizeHtml('<iframe src="https://example.com"></iframe><p>Safe</p>')).toBe('<p>Safe</p>');
  });
});
