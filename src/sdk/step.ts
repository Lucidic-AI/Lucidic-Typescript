import { StepParams } from '../client/types';
import { getHttp, getSessionId, getAgentId } from './init';
import { StepResource } from '../client/resources/step';

export async function createStep(params: StepParams = {}): Promise<string | undefined> {
  const http = getHttp();
  const sessionId = getSessionId();
  if (!sessionId) return;
  const stepRes = new StepResource(http);
  const { step_id } = await stepRes.initStep(sessionId);
  await stepRes.updateStep(step_id, params, getAgentId());
  return step_id;
}

export async function updateStep(params: StepParams): Promise<void> {
  const http = getHttp();
  if (!params.stepId) throw new Error('No active step to update');
  const stepRes = new StepResource(http);
  await stepRes.updateStep(params.stepId, params, getAgentId());
}

export async function endStep(params: StepParams = {}): Promise<void> {
  const http = getHttp();
  if (!params.stepId) throw new Error('No active step to end');
  const stepRes = new StepResource(http);
  await stepRes.updateStep(params.stepId, { ...params, stepId: params.stepId, evalDescription: params.evalDescription }, getAgentId());
}

