export class LucidicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LucidicError';
    Object.setPrototypeOf(this, LucidicError.prototype);
  }
}

export class APIError extends LucidicError {
  public statusCode?: number;
  public response?: any;

  constructor(message: string, statusCode?: number, response?: any) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.response = response;
    Object.setPrototypeOf(this, APIError.prototype);
  }
}

export class ConfigurationError extends LucidicError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

export class SessionError extends LucidicError {
  constructor(message: string) {
    super(message);
    this.name = 'SessionError';
    Object.setPrototypeOf(this, SessionError.prototype);
  }
}

export class StepError extends LucidicError {
  constructor(message: string) {
    super(message);
    this.name = 'StepError';
    Object.setPrototypeOf(this, StepError.prototype);
  }
}

export class EventError extends LucidicError {
  constructor(message: string) {
    super(message);
    this.name = 'EventError';
    Object.setPrototypeOf(this, EventError.prototype);
  }
}

export class PromptError extends LucidicError {
  constructor(message: string) {
    super(message);
    this.name = 'PromptError';
    Object.setPrototypeOf(this, PromptError.prototype);
  }
}