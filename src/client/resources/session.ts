import { HttpClient } from '../httpClient';
import { InitParams, UpdateSessionParams } from '../types';

export class SessionResource {
  constructor(private http: HttpClient) {}

  async initSession(params: InitParams & { agentId: string }): Promise<{ session_id: string }> {
    const {
      sessionName,
      sessionId,
      task,
      experimentId,
      rubrics,
      tags,
      productionMonitoring,
      datasetItemId,
      agentId,
    } = params;
    return this.http.post('initsession', {
      agent_id: agentId,
      session_name: sessionName,
      task,
      experiment_id: experimentId,
      rubrics,
      tags,
      session_id: sessionId,
      production_monitoring: productionMonitoring,
      dataset_item_id: datasetItemId,
    });
  }

  async updateSession(sessionId: string, params: UpdateSessionParams): Promise<void> {
    await this.http.put('updatesession', {
      session_id: sessionId,
      is_finished: params.isSuccessful === undefined ? undefined : false,
      task: params.task,
      is_successful: params.isSuccessful,
      is_successful_reason: params.isSuccessfulReason,
      session_eval: params.sessionEval,
      session_eval_reason: params.sessionEvalReason,
      tags: params.tags,
    });
  }

  async endSession(sessionId: string, params: UpdateSessionParams): Promise<void> {
    await this.http.put('updatesession', {
      session_id: sessionId,
      is_finished: true,
      task: params.task,
      is_successful: params.isSuccessful,
      is_successful_reason: params.isSuccessfulReason,
      session_eval: params.sessionEval,
      session_eval_reason: params.sessionEvalReason,
      tags: params.tags,
    });
  }
}

