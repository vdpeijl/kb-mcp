import type { Source } from '../config/schema.js';

export interface ZendeskArticle {
  id: number;
  title: string;
  body: string;
  section_id: number;
  updated_at: string;
  html_url: string;
  draft: boolean;
  promoted: boolean;
}

export interface ZendeskArticlesResponse {
  articles: ZendeskArticle[];
  next_page: string | null;
  count: number;
  page: number;
  per_page: number;
  page_count: number;
}

export interface ZendeskSection {
  id: number;
  name: string;
  category_id: number;
}

export interface ZendeskCategory {
  id: number;
  name: string;
}

interface RetryOptions {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 5,
  initialDelay: 1000,
  maxDelay: 60000,
};

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with retry logic and exponential backoff
 */
async function fetchWithRetry(
  url: string,
  options: RetryOptions = DEFAULT_RETRY_OPTIONS
): Promise<Response> {
  let lastError: Error | null = null;
  let delay = options.initialDelay;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      const response = await fetch(url);

      // Handle rate limiting (429)
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : Math.min(delay * Math.pow(2, attempt), options.maxDelay);

        if (attempt < options.maxRetries) {
          console.error(`⚠ Rate limited by Zendesk, waiting ${Math.round(waitTime / 1000)}s... (retry ${attempt + 1}/${options.maxRetries})`);
          await sleep(waitTime);
          continue;
        }

        throw new Error('Rate limit exceeded. Please try again later.');
      }

      // Success or non-retryable error
      if (response.ok || response.status < 500) {
        return response;
      }

      // Server error (5xx) - retry
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      lastError = error as Error;

      // Don't retry on network errors if we've exhausted retries
      if (attempt >= options.maxRetries) {
        break;
      }

      // Wait before retrying
      const waitTime = Math.min(delay * Math.pow(2, attempt), options.maxDelay);
      console.error(`⚠ Request failed, retrying in ${Math.round(waitTime / 1000)}s... (attempt ${attempt + 1}/${options.maxRetries})`);
      await sleep(waitTime);
    }
  }

  throw lastError || new Error('Request failed after retries');
}

/**
 * Fetch all articles from a Zendesk Help Center
 */
export async function fetchAllArticles(
  source: Source,
  onProgress?: (fetched: number) => void
): Promise<ZendeskArticle[]> {
  const articles: ZendeskArticle[] = [];
  let nextPage: string | null = `${source.baseUrl}/api/v2/help_center/${source.locale}/articles.json?per_page=100`;

  while (nextPage) {
    try {
      const response = await fetchWithRetry(nextPage);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch articles from ${source.baseUrl}: HTTP ${response.status}\n\n` +
          `Make sure the URL is correct and the Help Center is publicly accessible.`
        );
      }

      const data = (await response.json()) as ZendeskArticlesResponse;

      // Filter out drafts
      const publishedArticles = data.articles.filter(a => !a.draft);
      articles.push(...publishedArticles);

      if (onProgress) {
        onProgress(articles.length);
      }

      nextPage = data.next_page;

      // Small delay between pages to be nice to Zendesk
      if (nextPage) {
        await sleep(100);
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(
          `Failed to fetch articles from ${source.name}:\n${error.message}`
        );
      }
      throw error;
    }
  }

  return articles;
}

/**
 * Fetch sections from a Zendesk Help Center
 */
export async function fetchSections(source: Source): Promise<Map<number, string>> {
  const sectionMap = new Map<number, string>();
  let nextPage: string | null = `${source.baseUrl}/api/v2/help_center/${source.locale}/sections.json?per_page=100`;

  while (nextPage) {
    try {
      const response = await fetchWithRetry(nextPage);

      if (!response.ok) {
        // Sections are optional, just return empty map
        return sectionMap;
      }

      const data = (await response.json()) as { sections: ZendeskSection[]; next_page: string | null };

      for (const section of data.sections) {
        sectionMap.set(section.id, section.name);
      }

      nextPage = data.next_page;

      if (nextPage) {
        await sleep(100);
      }
    } catch (error) {
      // Sections are optional, just return what we have
      return sectionMap;
    }
  }

  return sectionMap;
}

/**
 * Fetch categories from a Zendesk Help Center
 */
export async function fetchCategories(source: Source): Promise<Map<number, string>> {
  const categoryMap = new Map<number, string>();
  let nextPage: string | null = `${source.baseUrl}/api/v2/help_center/${source.locale}/categories.json?per_page=100`;

  while (nextPage) {
    try {
      const response = await fetchWithRetry(nextPage);

      if (!response.ok) {
        // Categories are optional, just return empty map
        return categoryMap;
      }

      const data = (await response.json()) as { categories: ZendeskCategory[]; next_page: string | null };

      for (const category of data.categories) {
        categoryMap.set(category.id, category.name);
      }

      nextPage = data.next_page;

      if (nextPage) {
        await sleep(100);
      }
    } catch (error) {
      // Categories are optional, just return what we have
      return categoryMap;
    }
  }

  return categoryMap;
}

/**
 * Test connection to a Zendesk Help Center
 */
export async function testConnection(source: Source): Promise<boolean> {
  try {
    const url = `${source.baseUrl}/api/v2/help_center/${source.locale}/articles.json?per_page=1`;
    const response = await fetch(url);
    return response.ok;
  } catch (error) {
    return false;
  }
}
