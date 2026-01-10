import type { OllamaConfig } from '../config/schema.js';

interface OllamaEmbeddingResponse {
  embedding: number[];
}

interface OllamaModelResponse {
  models: Array<{ name: string }>;
}

/**
 * Check if Ollama is running and accessible
 */
export async function checkOllamaConnection(config: OllamaConfig): Promise<boolean> {
  try {
    const response = await fetch(`${config.baseUrl}/api/tags`, {
      method: 'GET',
    });

    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Check if the embedding model is available
 */
export async function checkModelAvailable(config: OllamaConfig): Promise<boolean> {
  try {
    const response = await fetch(`${config.baseUrl}/api/tags`, {
      method: 'GET',
    });

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as OllamaModelResponse;
    return data.models.some(m => m.name === config.model || m.name.startsWith(`${config.model}:`));
  } catch (error) {
    return false;
  }
}

/**
 * Generate an embedding for a single text using Ollama
 */
export async function generateEmbedding(
  text: string,
  config: OllamaConfig
): Promise<Float32Array> {
  try {
    const response = await fetch(`${config.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        prompt: text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as OllamaEmbeddingResponse;

    if (!data.embedding || !Array.isArray(data.embedding)) {
      throw new Error('Invalid embedding response from Ollama');
    }

    // Verify dimension
    if (data.embedding.length !== 768) {
      throw new Error(
        `Expected 768-dimensional embedding, got ${data.embedding.length}. ` +
        `Make sure you're using the nomic-embed-text model.`
      );
    }

    return new Float32Array(data.embedding);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
        throw new Error(
          `Cannot connect to Ollama at ${config.baseUrl}\n\n` +
          `Make sure Ollama is running:\n` +
          `  ollama serve\n\n` +
          `Or update the baseUrl in your config.`
        );
      }
      throw error;
    }
    throw new Error('Unknown error generating embedding');
  }
}

/**
 * Process a queue of texts with concurrency limit
 */
async function processQueue<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number,
  onProgress?: (completed: number, total: number) => void
): Promise<R[]> {
  const results: R[] = [];
  let completed = 0;
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      const item = items[index];

      try {
        const result = await processor(item);
        results[index] = result;

        completed++;
        if (onProgress) {
          onProgress(completed, items.length);
        }
      } catch (error) {
        // Re-throw to be caught by Promise.all
        throw error;
      }
    }
  }

  // Create worker promises
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());

  // Wait for all workers to complete
  await Promise.all(workers);

  return results;
}

/**
 * Generate embeddings for multiple texts with concurrency control
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  config: OllamaConfig,
  concurrency: number = 5,
  onProgress?: (completed: number, total: number) => void
): Promise<Float32Array[]> {
  if (texts.length === 0) {
    return [];
  }

  return processQueue(
    texts,
    (text) => generateEmbedding(text, config),
    concurrency,
    onProgress
  );
}

/**
 * Estimate token count (rough approximation: 4 characters = 1 token)
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
