import { v4 as uuidv4 } from 'uuid';
import { Client } from '../client';
import { SessionError } from '../errors';
import { logger } from '../utils/logger';
import { SessionConfig, StepConfig, EventConfig } from '../types';
import { Step } from './step';
import { Event } from './event';

export class Session {
  private client: Client;
  public sessionId: string;
  public sessionName: string;
  public agentId: string;
  public task?: string;
  public userId?: string;
  public groupId?: string;
  public testId?: string;
  public tags?: Record<string, any>;
  public isFinished: boolean;
  public activeStep: Step | null;
  public steps: Step[];
  public events: Event[];

  constructor(client: Client, config: SessionConfig) {
    this.client = client;
    this.sessionId = config.sessionId || uuidv4();
    this.sessionName = config.sessionName || 'Unnamed Session';
    this.agentId = config.agentId || client.getAgentId();
    this.task = config.task;
    this.userId = config.userId;
    this.groupId = config.groupId;
    this.testId = config.testId;
    this.tags = config.tags;
    this.isFinished = false;
    this.activeStep = null;
    this.steps = [];
    this.events = [];
  }

  /**
   * Update the session
   */
  public async updateSession(
    task?: string,
    tags?: Record<string, any>,
    isFinished?: boolean,
    isSuccessful?: boolean,
    isSuccessfulReason?: string
  ): Promise<void> {
    try {
      // Update local state
      if (task !== undefined) this.task = task;
      if (tags !== undefined) this.tags = { ...this.tags, ...tags };
      if (isFinished !== undefined) this.isFinished = isFinished;

      await this.client.updateSession(
        this.sessionId,
        isFinished,
        isSuccessful,
        isSuccessfulReason
      );

      logger.debug(`Session updated: ${this.sessionId}`);
    } catch (error) {
      throw new SessionError(`Failed to update session: ${error}`);
    }
  }

  /**
   * Create a new step
   */
  public async createStep(config: StepConfig = {}): Promise<Step> {
    // End active step if exists
    if (this.activeStep && !this.activeStep.isFinished) {
      await this.activeStep.end();
    }

    const step = new Step(this.client, this.sessionId, config);
    await step.create();
    
    this.activeStep = step;
    this.steps.push(step);
    
    return step;
  }

  /**
   * Create an event
   * If no active step exists, create a temporary one
   */
  public async createEvent(config: EventConfig = {}): Promise<Event> {
    let stepId = config.stepId;

    // If no step ID and no active step, create a temporary step
    if (!stepId && !this.activeStep) {
      logger.debug('No active step, creating temporary step for event');
      const tempStep = await this.createStep({
        state: 'Event Processing',
        action: 'Processing event',
        goal: 'Complete event execution'
      });
      stepId = tempStep.stepId;
    } else if (!stepId && this.activeStep) {
      stepId = this.activeStep.stepId;
    }
    
    // If event has no description, provide a default
    if (!config.description) {
      config = { ...config, description: 'Auto-created event' };
    }

    const event = new Event(this.client, this.sessionId, {
      ...config,
      stepId
    });

    await event.create();
    this.events.push(event);

    // Add to active step if it belongs to it
    if (this.activeStep && stepId === this.activeStep.stepId) {
      this.activeStep.events.push(event);
    }

    return event;
  }

  /**
   * Update an event
   */
  public async updateEvent(
    eventId: string,
    result?: string,
    isFinished?: boolean,
    costAdded?: number,
    model?: string,
    description?: string
  ): Promise<void> {
    const event = this.events.find(e => e.eventId === eventId);
    if (!event) {
      throw new SessionError(`Event ${eventId} not found in session`);
    }

    await event.update(result, isFinished, costAdded, model, description);
  }

  /**
   * End the active step
   */
  public async endStep(evalScore?: number, evalDescription?: string): Promise<void> {
    if (!this.activeStep) {
      logger.warn('No active step to end');
      return;
    }

    await this.activeStep.end(evalScore, evalDescription);
    this.activeStep = null;
  }

  /**
   * End the session
   */
  public async endSession(isSuccessful: boolean = true, reason?: string): Promise<void> {
    if (this.isFinished) {
      logger.warn(`Session ${this.sessionId} is already finished`);
      return;
    }

    // Auto-end any unfinished steps
    for (const step of this.steps) {
      if (!step.isFinished) {
        logger.debug(`Auto-ending unfinished step ${step.stepId}`);
        await step.end(100, 'Step auto-ended on session end');
      }
    }

    await this.updateSession(undefined, undefined, true, isSuccessful, reason);
    logger.info(`Session ended: ${this.sessionId}`);
  }

  /**
   * Get the current active step
   */
  public getActiveStep(): Step | null {
    return this.activeStep;
  }

  /**
   * Get all steps
   */
  public getSteps(): Step[] {
    return this.steps;
  }

  /**
   * Get all events
   */
  public getEvents(): Event[] {
    return this.events;
  }
}