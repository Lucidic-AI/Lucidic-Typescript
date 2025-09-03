import { DatasetResource, DatasetResponse, DatasetItem } from '../client/resources/dataset';
import { getOrCreateHttp, getAgentIdSafe } from './init';
import { info, error as logError } from '../util/logger';
import dotenv from 'dotenv';
import { GetDatasetParams } from '../client/types';

/**
 * Get a dataset by ID with all its items.
 * 
 * @param params - Parameters for dataset retrieval
 * @param params.datasetId - The ID of the dataset to retrieve (required)
 * @param params.apiKey - API key, uses LUCIDIC_API_KEY env if not provided
 * @param params.agentId - Agent ID, uses LUCIDIC_AGENT_ID env if not provided
 * @returns The dataset with all items
 * @throws Error if dataset ID is empty or credentials are missing
 */
export async function getDataset(params: GetDatasetParams): Promise<DatasetResponse> {
  dotenv.config();

  // Validation
  if (!params.datasetId) {
    throw new Error('Dataset ID is required');
  }

  // Get credentials - use provided or fall back to env/existing state
  const apiKey = params.apiKey ?? process.env.LUCIDIC_API_KEY;
  const agentId = params.agentId ?? getAgentIdSafe() ?? process.env.LUCIDIC_AGENT_ID;
  
  if (!apiKey) {
    throw new Error('LUCIDIC_API_KEY not provided. Set the environment variable or pass apiKey parameter.');
  }
  if (!agentId) {
    throw new Error('LUCIDIC_AGENT_ID not provided. Set the environment variable or pass agentId parameter.');
  }

  // Get or create HTTP client (will reuse if credentials match)
  const http = getOrCreateHttp(apiKey, agentId);
  const datasetResource = new DatasetResource(http);

  try {
    info(`Fetching dataset '${params.datasetId}'...`);
    
    const dataset = await datasetResource.getDataset(params.datasetId);

    info(`Retrieved dataset '${dataset.name}' with ${dataset.num_items} items`);
    return dataset;
  } catch (err) {
    logError('Failed to get dataset:', err);
    throw err;
  }
}

/**
 * Convenience function to get just the items from a dataset.
 * 
 * @param params - Parameters for dataset retrieval
 * @param params.datasetId - The ID of the dataset to retrieve items from (required)
 * @param params.apiKey - API key, uses LUCIDIC_API_KEY env if not provided
 * @param params.agentId - Agent ID, uses LUCIDIC_AGENT_ID env if not provided
 * @returns Array of dataset items
 * @throws Error if dataset ID is empty or credentials are missing
 */
export async function getDatasetItems(params: GetDatasetParams): Promise<DatasetItem[]> {
  const dataset = await getDataset(params);
  return dataset.items;
}