import { HttpClient } from '../httpClient';
import { CreateExperimentParams } from '../types';

export class ExperimentResource {
  constructor(private http: HttpClient) {}

  async createExperiment(
    agentId: string,
    params: Omit<CreateExperimentParams, 'apiKey' | 'agentId'>
  ): Promise<{ experiment_id: string; experiment_name: string }> {
    const rubricNames = [
      ...(params.passFailRubrics || []),
      ...(params.scoreRubrics || [])
    ];

    return this.http.post('createexperiment', {
      agent_id: agentId,
      experiment_name: params.experimentName,
      description: params.description || '',
      tags: params.tags || [],
      rubric_names: rubricNames || [],
    });
  }
}