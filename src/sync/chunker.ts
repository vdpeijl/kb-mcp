import { estimateTokenCount } from '../search/embeddings.js';

export interface TextChunk {
  text: string;
  index: number;
  tokenCount: number;
}

/**
 * Split text into sentences (simple approach)
 */
function splitIntoSentences(text: string): string[] {
  // Split on sentence boundaries
  const sentences = text
    .split(/([.!?]+\s+|\n\n)/)
    .reduce((acc: string[], part, i, arr) => {
      if (i % 2 === 0) {
        // Combine sentence with its delimiter
        const sentence = part + (arr[i + 1] || '');
        if (sentence.trim()) {
          acc.push(sentence);
        }
      }
      return acc;
    }, []);

  return sentences;
}

/**
 * Chunk text into smaller pieces with overlap
 *
 * @param text - The text to chunk
 * @param title - Article title (will be prepended to each chunk)
 * @param targetSize - Target chunk size in tokens (default: 500)
 * @param overlap - Number of tokens to overlap between chunks (default: 50)
 */
export function chunkText(
  text: string,
  title: string,
  targetSize: number = 500,
  overlap: number = 50
): TextChunk[] {
  // Prepend title
  const titlePrefix = `# ${title}\n\n`;

  // Split into sentences
  const sentences = splitIntoSentences(text);

  if (sentences.length === 0) {
    // Empty text, return single chunk with just title
    return [{
      text: titlePrefix.trim(),
      index: 0,
      tokenCount: estimateTokenCount(titlePrefix.trim()),
    }];
  }

  const chunks: TextChunk[] = [];
  let currentChunk: string[] = [];
  let currentTokens = 0;

  // Reserve tokens for title
  const titleTokens = estimateTokenCount(titlePrefix);
  const effectiveTargetSize = targetSize - titleTokens;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const sentenceTokens = estimateTokenCount(sentence);

    // If single sentence exceeds target, split it (edge case)
    if (sentenceTokens > effectiveTargetSize && currentChunk.length === 0) {
      // Split by words if sentence is too long
      const words = sentence.split(/\s+/);
      let wordChunk: string[] = [];
      let wordTokens = 0;

      for (const word of words) {
        const wordToken = estimateTokenCount(word + ' ');
        if (wordTokens + wordToken > effectiveTargetSize && wordChunk.length > 0) {
          chunks.push({
            text: titlePrefix + wordChunk.join(' '),
            index: chunks.length,
            tokenCount: titleTokens + wordTokens,
          });
          wordChunk = [];
          wordTokens = 0;
        }
        wordChunk.push(word);
        wordTokens += wordToken;
      }

      if (wordChunk.length > 0) {
        chunks.push({
          text: titlePrefix + wordChunk.join(' '),
          index: chunks.length,
          tokenCount: titleTokens + wordTokens,
        });
      }

      continue;
    }

    // Check if adding this sentence would exceed target
    if (currentTokens + sentenceTokens > effectiveTargetSize && currentChunk.length > 0) {
      // Save current chunk
      chunks.push({
        text: titlePrefix + currentChunk.join(' '),
        index: chunks.length,
        tokenCount: titleTokens + currentTokens,
      });

      // Start new chunk with overlap
      // Keep last few sentences for context
      const overlapSentences: string[] = [];
      let overlapTokens = 0;

      for (let j = currentChunk.length - 1; j >= 0; j--) {
        const overlapSentence = currentChunk[j];
        const tokens = estimateTokenCount(overlapSentence);

        if (overlapTokens + tokens > overlap) {
          break;
        }

        overlapSentences.unshift(overlapSentence);
        overlapTokens += tokens;
      }

      currentChunk = overlapSentences;
      currentTokens = overlapTokens;
    }

    currentChunk.push(sentence);
    currentTokens += sentenceTokens;
  }

  // Add final chunk if not empty
  if (currentChunk.length > 0) {
    chunks.push({
      text: titlePrefix + currentChunk.join(' '),
      index: chunks.length,
      tokenCount: titleTokens + currentTokens,
    });
  }

  return chunks;
}
