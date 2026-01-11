import * as cheerio from 'cheerio';

/**
 * Strip HTML and extract clean text from article body
 */
export function parseHTML(html: string): string {
  // Handle cases where html is not a string (null, undefined, etc.)
  if (!html || typeof html !== 'string') {
    return '';
  }

  const $ = cheerio.load(html);

  // Remove script and style tags
  $('script, style').remove();

  // Get text content
  let text = $.text();

  // Clean up whitespace
  text = text
    .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
    .replace(/\n\s*\n/g, '\n\n')  // Replace multiple newlines with double newline
    .trim();

  return text;
}

/**
 * Parse HTML with better handling of lists and structure
 */
export function parseHTMLStructured(html: string): string {
  // Handle cases where html is not a string (null, undefined, etc.)
  if (!html || typeof html !== 'string') {
    return '';
  }

  const $ = cheerio.load(html);

  // Remove unwanted elements
  $('script, style, noscript, iframe').remove();

  // Process the DOM to extract structured text
  function extractText(element: any): string {
    const $el = $(element);
    const tagName = element.tagName?.toLowerCase();

    // Handle different elements
    if (tagName === 'ul' || tagName === 'ol') {
      const items = $el.find('> li')
        .map((_, li) => {
          const text = extractText(li).trim();
          return text ? `• ${text}` : '';
        })
        .get()
        .filter(Boolean);

      return items.length > 0 ? items.join('\n') + '\n' : '';
    }

    if (tagName === 'li') {
      // Get direct text content and nested lists
      let text = '';
      $el.contents().each((_, node) => {
        if (node.type === 'text') {
          text += $(node).text();
        } else if (node.type === 'tag') {
          text += extractText(node);
        }
      });
      return text.trim();
    }

    if (tagName === 'p' || tagName === 'div' || tagName === 'section') {
      let text = '';
      $el.contents().each((_, node) => {
        if (node.type === 'text') {
          text += $(node).text();
        } else if (node.type === 'tag') {
          text += extractText(node);
        }
      });
      const trimmed = text.trim();
      return trimmed ? trimmed + '\n\n' : '';
    }

    if (tagName === 'br') {
      return '\n';
    }

    if (tagName === 'table') {
      // Simple table handling - extract all text
      return $el.text().trim() + '\n\n';
    }

    // Default: get all text content
    return $el.text();
  }

  const text = extractText($('body')[0] || $.root()[0]);

  // Clean up whitespace
  return text
    .replace(/\n{3,}/g, '\n\n')  // Max 2 consecutive newlines
    .replace(/  +/g, ' ')  // Replace multiple spaces with single space
    .trim();
}
