import { getPromptResource } from './init';
import type { GetPromptParams } from '../client/types';

/**
 * Fetch a prompt by name and substitute variables.
 * Uses the singleton PromptResource created during init().
 */
export async function getPrompt(params: GetPromptParams): Promise<string> {
  const pr = getPromptResource();
  return pr.getPrompt(
    params.promptName,
    params.variables,
    params.cacheTtl ?? 300,
    params.label ?? 'production',
  );
}

/**
 * Fetch a raw prompt by name without substitution.
 */
export async function getRawPrompt(params: Omit<GetPromptParams, 'variables'>): Promise<string> {
  const pr = getPromptResource();
  return pr.getRawPrompt(
    params.promptName,
    params.cacheTtl ?? 300,
    params.label ?? 'production',
  );
}


