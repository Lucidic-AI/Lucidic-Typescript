import { HttpClient } from '../httpClient';
import { EventParams } from '../types';
import { getPresignedUploadUrl, uploadImageToS3, dataUrlToJpegBuffer } from './upload';
import { debug } from '../../util/logger';

export class EventResource {
  constructor(private http: HttpClient) {}

  async initEvent(params: EventParams & { sessionId?: string; agentId?: string }): Promise<{ event_id: string; step_id: string }> {
    const payload: any = {
      description: params.description,
      result: params.result,
      is_finished: params.eventId ? undefined : params.result ? true : undefined,
      cost_added: params.costAdded,
      model: params.model,
      nscreenshots: params.screenshots?.length,
      duration: undefined,
      function_name: params.functionName,
      arguments: params.arguments,
    };
    if (params.stepId) payload.step_id = params.stepId;
    if (!params.stepId && params.sessionId) payload.session_id = params.sessionId;
    debug('initevent payload', payload);
    const res = await this.http.post<{ event_id: string; step_id: string }>('initevent', payload);
    // Upload any screenshots
    if (params.screenshots && params.screenshots.length && params.agentId) {
      for (let i = 0; i < params.screenshots.length; i++) {
        const { presigned_url } = await getPresignedUploadUrl(this.http, {
          agentId: params.agentId,
          eventId: res.event_id,
          nthScreenshot: i,
        });
        const buf = await dataUrlToJpegBuffer(params.screenshots[i]);
        debug('Uploading event screenshot', { nth: i, size: buf.byteLength });
        await uploadImageToS3(presigned_url, buf, 'image/jpeg');
      }
    }
    return res;
  }

  async updateEvent(eventId: string, params: EventParams): Promise<void> {
    await this.http.put('updateevent', {
      event_id: eventId,
      description: params.description,
      result: params.result,
      cost_added: params.costAdded,
      model: params.model,
      is_finished: params.result ? true : undefined,
      duration: undefined,
      function_name: params.functionName,
      arguments: params.arguments,
    });
  }
}

