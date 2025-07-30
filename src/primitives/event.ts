import { v4 as uuidv4 } from 'uuid';
import { Client } from '../client';
import { EventError } from '../errors';
import { logger } from '../utils/logger';
import { EventConfig } from '../types';

export class Event {
  private client: Client;
  public sessionId: string;
  public stepId?: string;
  public eventId: string;
  public description: string;
  public result?: string;
  public model?: string;
  public screenshots?: string[];
  public isFinished: boolean;
  public isSuccessful: boolean;
  public costAdded?: number;

  constructor(client: Client, sessionId: string, config: EventConfig) {
    this.client = client;
    this.sessionId = sessionId;
    this.stepId = config.stepId;
    this.eventId = config.eventId || uuidv4();
    this.description = config.description || '';
    this.result = config.result;
    this.model = config.model;
    this.screenshots = config.screenshots;
    this.isFinished = config.isFinished ?? false;
    this.isSuccessful = config.isSuccessful ?? true;
    this.costAdded = config.costAdded;
  }

  /**
   * Create the event on the backend
   */
  public async create(): Promise<string> {
    try {
      const eventId = await this.client.createEvent({
        sessionId: this.sessionId,
        stepId: this.stepId,
        eventId: this.eventId,
        description: this.description,
        result: this.result,
        model: this.model,
        screenshots: this.screenshots,
        isFinished: this.isFinished,
        isSuccessful: this.isSuccessful,
        costAdded: this.costAdded
      });

      this.eventId = eventId;
      logger.info(`Event created: ${this.eventId}`);
      return this.eventId;
    } catch (error) {
      throw new EventError(`Failed to create event: ${error}`);
    }
  }

  /**
   * Update the event
   */
  public async update(
    result?: string,
    isFinished?: boolean,
    costAdded?: number,
    model?: string,
    description?: string
  ): Promise<void> {
    try {
      await this.client.updateEvent(
        this.eventId,
        result,
        isFinished,
        costAdded,
        model,
        description
      );

      // Update local state
      if (result !== undefined) this.result = result;
      if (isFinished !== undefined) this.isFinished = isFinished;
      if (costAdded !== undefined) this.costAdded = costAdded;
      if (model !== undefined) this.model = model;
      if (description !== undefined) this.description = description;

      logger.debug(`Event updated: ${this.eventId}`);
    } catch (error) {
      throw new EventError(`Failed to update event: ${error}`);
    }
  }

  /**
   * End the event
   */
  public async end(result?: string, isSuccessful: boolean = true): Promise<void> {
    if (this.isFinished) {
      logger.warn(`Event ${this.eventId} is already finished`);
      return;
    }

    await this.update(result, true);
    this.isSuccessful = isSuccessful;
    logger.info(`Event ended: ${this.eventId}`);
  }
}