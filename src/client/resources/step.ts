import { HttpClient } from '../httpClient';
import { StepParams } from '../types';
import { getPresignedUploadUrl, uploadImageToS3, dataUrlToJpegBuffer, pathToJpegBase64 } from './upload';
import { debug } from '../../util/logger';

export class StepResource {
  constructor(private http: HttpClient) {}

  async initStep(sessionId: string): Promise<{ step_id: string }> {
    return this.http.post('initstep', { session_id: sessionId });
  }

  async updateStep(stepId: string, params: StepParams, agentId: string): Promise<void> {
    // Upload screenshot if provided
    let hasScreenshot: boolean | undefined;
    if (params.screenshotPath) {
      const base64 = await pathToJpegBase64(params.screenshotPath);
      const { presigned_url } = await getPresignedUploadUrl(this.http, { agentId, stepId });
      const buf = await dataUrlToJpegBuffer(`data:image/jpeg;base64,${base64}`);
      debug('Uploading step screenshot (from path)', { size: buf.byteLength });
      await uploadImageToS3(presigned_url, buf, 'image/jpeg');
      hasScreenshot = true;
    } else if (params.screenshot) {
      const { presigned_url } = await getPresignedUploadUrl(this.http, { agentId, stepId });
      const buf = await dataUrlToJpegBuffer(params.screenshot);
      debug('Uploading step screenshot (data URL)', { size: buf.byteLength });
      await uploadImageToS3(presigned_url, buf, 'image/jpeg');
      hasScreenshot = true;
    }

    await this.http.put('updatestep', {
      step_id: stepId,
      goal: params.goal,
      action: params.action,
      state: params.state,
      eval_score: params.evalScore,
      eval_description: params.evalDescription,
      has_screenshot: hasScreenshot,
    });
  }
}

