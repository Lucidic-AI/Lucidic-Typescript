import { HttpClient } from '../httpClient';
import { EventType } from '../types';
import { debug } from '../../util/logger';

export interface CreateEventApiPayload {
  client_event_id: string;
  parent_client_event_id?: string;
  session_id: string;
  type: EventType;
  occurred_at: string;
  duration?: number;
  tags?: string[];
  metadata?: Record<string, any>;
  payload: any;
  needs_blob?: boolean;
}

export class EventResource {
  constructor(private http: HttpClient) {}

  async createEvent(params: CreateEventApiPayload): Promise<{ blob_url?: string }> {
    debug('Creating event', { type: params.type, clientId: params.client_event_id, parentId: params.parent_client_event_id });
    return this.http.post<{ blob_url?: string }>('events', params);
  }
}

