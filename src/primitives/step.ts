import { v4 as uuidv4 } from 'uuid';
import { Client } from '../client';
import { StepError } from '../errors';
import { logger } from '../utils/logger';
import { StepConfig, EventConfig } from '../types';
import { Event } from './event';

export class Step {
  private client: Client;
  public sessionId: string;
  public stepId: string;
  public state: string;
  public action: string;
  public goal: string;
  public isFinished: boolean;
  public events: Event[];

  constructor(client: Client, sessionId: string, config: StepConfig) {
    this.client = client;
    this.sessionId = sessionId;
    this.stepId = config.stepId || uuidv4();
    this.state = config.state || '';
    this.action = config.action || '';
    this.goal = config.goal || '';
    this.isFinished = false;
    this.events = [];
  }

  /**
   * Create the step on the backend
   */
  public async create(): Promise<string> {
    try {
      const stepId = await this.client.createStep({
        sessionId: this.sessionId,
        stepId: this.stepId,
        state: this.state,
        action: this.action,
        goal: this.goal
      });

      this.stepId = stepId;
      logger.info(`Step created: ${this.stepId}`);
      return this.stepId;
    } catch (error) {
      throw new StepError(`Failed to create step: ${error}`);
    }
  }

  /**
   * Update the step
   */
  public async update(
    isFinished?: boolean,
    evalScore?: number,
    evalDescription?: string
  ): Promise<void> {
    try {
      await this.client.updateStep(
        this.stepId,
        isFinished,
        evalScore,
        evalDescription
      );

      if (isFinished !== undefined) {
        this.isFinished = isFinished;
      }

      logger.debug(`Step updated: ${this.stepId}`);
    } catch (error) {
      throw new StepError(`Failed to update step: ${error}`);
    }
  }

  /**
   * Create an event within this step
   */
  public async createEvent(config: EventConfig): Promise<Event> {
    const event = new Event(this.client, this.sessionId, {
      ...config,
      stepId: this.stepId
    });

    await event.create();
    this.events.push(event);
    return event;
  }

  /**
   * End the step
   */
  public async end(evalScore?: number, evalDescription?: string): Promise<void> {
    if (this.isFinished) {
      logger.warn(`Step ${this.stepId} is already finished`);
      return;
    }

    await this.update(true, evalScore, evalDescription);
    logger.info(`Step ended: ${this.stepId}`);
  }
}