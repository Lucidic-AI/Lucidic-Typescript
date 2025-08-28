import { HttpClient } from '../httpClient';
import { EventType } from '../types';
import { getPresignedUploadUrl, uploadImageToS3, dataUrlToJpegBuffer } from './upload';
import { debug } from '../../util/logger';

export interface EventApiPayload {
  type: EventType;
  parent_event_id?: string;
  occurred_at: string;
  tags?: string[];
  metadata?: Record<string, any>;
  payload: any;
  duration?: number;
  session_id?: string;
}

export class EventResource {
  constructor(private http: HttpClient) {}

  async initEvent(params: {
    type: EventType;
    parentEventId?: string;
    occurredAt: string;
    tags?: string[];
    metadata?: Record<string, any>;
    payload: any;
    duration?: number;
    screenshots?: string[];
    sessionId?: string;
    agentId?: string;
  }): Promise<{ event_id: string }> {
    const apiPayload: EventApiPayload = {
      type: params.type,
      parent_event_id: params.parentEventId,
      occurred_at: params.occurredAt,
      tags: params.tags || [],
      metadata: params.metadata || {},
      payload: params.payload,
      duration: params.duration,
      session_id: params.sessionId,
    };

    debug('Creating event', { type: params.type, parentEventId: params.parentEventId });
    const res = await this.http.post<{ event_id: string }>('api/events', apiPayload);

    if (params.screenshots?.length && params.agentId) {
      debug(`Uploading ${params.screenshots.length} screenshots for event ${res.event_id}`);
      for (let i = 0; i < params.screenshots.length; i++) {
        try {
          const { presigned_url } = await getPresignedUploadUrl(this.http, {
            agentId: params.agentId,
            eventId: res.event_id,
            nthScreenshot: i,
          });
          const buf = await dataUrlToJpegBuffer(params.screenshots[i]);
          await uploadImageToS3(presigned_url, buf, 'image/jpeg');
          debug(`Screenshot ${i} uploaded successfully`);
        } catch (error) {
          debug(`Failed to upload screenshot ${i}:`, error);
        }
      }
    }

    return res;
  }

  async updateEvent(eventId: string, updates: {
    tags?: string[];
    metadata?: Record<string, any>;
    payload?: any;
    duration?: number;
  }): Promise<void> {
    const updatePayload: any = { event_id: eventId };
    if (updates.tags !== undefined) updatePayload.tags = updates.tags;
    if (updates.metadata !== undefined) updatePayload.metadata = updates.metadata;
    if (updates.payload !== undefined) updatePayload.payload = updates.payload;
    if (updates.duration !== undefined) updatePayload.duration = updates.duration;
    await this.http.patch(`api/events/${eventId}`, updatePayload);
  }
}

