import { z } from 'zod';

/**
 * Zod schema for Ollama configuration
 */
export const OllamaConfigSchema = z.object({
  baseUrl: z.string().url().default('http://localhost:11434'),
  model: z.string().default('nomic-embed-text'),
});

/**
 * Zod schema for sync configuration
 */
export const SyncConfigSchema = z.object({
  chunkSize: z.number().int().positive().default(500),
  chunkOverlap: z.number().int().nonnegative().default(50),
});

/**
 * Zod schema for a knowledge base source
 */
export const SourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  baseUrl: z.string().url(),
  locale: z.string().min(2),
  enabled: z.boolean().default(true),
});

/**
 * Zod schema for the complete configuration
 */
export const ConfigSchema = z.object({
  ollama: OllamaConfigSchema.default({}),
  sync: SyncConfigSchema.default({}),
  sources: z.array(SourceSchema).default([]),
});

/**
 * TypeScript types inferred from schemas
 */
export type OllamaConfig = z.infer<typeof OllamaConfigSchema>;
export type SyncConfig = z.infer<typeof SyncConfigSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Config = z.infer<typeof ConfigSchema>;
