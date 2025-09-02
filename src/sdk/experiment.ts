import { CreateExperimentParams } from '../client/types';
import { ExperimentResource } from '../client/resources/experiment';
import { getOrCreateHttp, getAgentIdSafe } from './init';
import { info, error as logError } from '../util/logger';
import dotenv from 'dotenv';

/**
 * Create a new experiment for grouping and analyzing sessions.
 * 
 * @param params - Experiment creation parameters
 * @param params.experimentName - Name of the experiment (required)
 * @param params.passFailRubrics - List of pass/fail rubric names (required, at least one)
 * @param params.scoreRubrics - List of score rubric names (optional)
 * @param params.description - Description of the experiment (optional)
 * @param params.tags - Tags for categorization (optional)
 * @param params.apiKey - API key, uses LUCIDIC_API_KEY env if not provided
 * @param params.agentId - Agent ID, uses LUCIDIC_AGENT_ID env if not provided
 * @returns The experiment ID
 * @throws Error if name is empty or no rubrics provided
 */
export async function createExperiment(params: CreateExperimentParams): Promise<string> {
  dotenv.config();

  // Validation
  if (!params.experimentName) {
    throw new Error('Experiment name is required');
  }
  if (!params.passFailRubrics || params.passFailRubrics.length === 0) {
    throw new Error('At least one pass/fail rubric is required');
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
  const experimentResource = new ExperimentResource(http);

  try {
    info(`Creating experiment '${params.experimentName}'...`);
    
    const response = await experimentResource.createExperiment(agentId, {
      experimentName: params.experimentName,
      passFailRubrics: params.passFailRubrics,
      scoreRubrics: params.scoreRubrics,
      description: params.description,
      tags: params.tags,
    });

    info(`Created experiment '${params.experimentName}' with ID: ${response.experiment_id}`);
    return response.experiment_id;
  } catch (err) {
    logError('Failed to create experiment:', err);
    throw err;
  }
}