import {
  EventType,
  EventParams,
  FlexibleEventParams,
  LLMGenerationEventParams,
  FunctionCallEventParams,
  ErrorTracebackEventParams,
  GenericEventParams,
  LLMGenerationPayload,
  FunctionCallPayload,
  ErrorTracebackPayload,
  GenericEventPayload,
  BaseEventParams,
  FIELD_MAPPINGS,
} from '../client/types';

export class EventBuilder {
  private static readonly BASE_FIELDS = new Set([
    'type', 'eventId', 'parentEventId', 'occurredAt',
    'duration', 'tags', 'metadata', 'screenshots',
  ]);

  private static readonly LLM_FIELDS = new Set([
    'provider', 'model', 'messages', 'prompt', 'output', 'completion',
    'response', 'input_tokens', 'output_tokens', 'cache', 'cost',
    'tool_calls', 'thinking', 'status', 'error', 'raw', 'params',
  ]);

  private static readonly FUNCTION_FIELDS = new Set([
    'function_name', 'functionName', 'arguments', 'args', 'return_value', 'returnValue', 'result',
  ]);

  private static readonly ERROR_FIELDS = new Set([
    'error', 'traceback', 'stack', 'stackTrace', 'exception',
  ]);

  private static readonly GENERIC_FIELDS = new Set([
    'details', 'description', 'message',
  ]);

  static build(params: FlexibleEventParams): EventParams {
    if (this.isStrictFormat(params)) {
      return params as unknown as EventParams;
    }

    const normalized = this.normalizeFields(params);
    const type: EventType = (normalized.type as EventType) || this.detectType(normalized);

    switch (type) {
      case 'llm_generation':
        return this.buildLLMEvent(normalized);
      case 'function_call':
        return this.buildFunctionEvent(normalized);
      case 'error_traceback':
        return this.buildErrorEvent(normalized);
      default:
        return this.buildGenericEvent(normalized);
    }
  }

  private static isStrictFormat(params: any): boolean {
    return params && typeof params === 'object' && 'payload' in params;
  }

  private static normalizeFields(params: FlexibleEventParams): FlexibleEventParams {
    const normalized: any = {};
    for (const [key, value] of Object.entries(params)) {
      const canonical = (FIELD_MAPPINGS as any)[key] || key;
      normalized[canonical] = value;
    }
    return normalized;
  }

  private static detectType(params: FlexibleEventParams): EventType {
    if (params.provider || params.model || params.messages || params.prompt ||
        params.input_tokens !== undefined || params.output_tokens !== undefined) {
      return 'llm_generation';
    }
    if (params.function_name || (params.arguments !== undefined && !params.error)) {
      return 'function_call';
    }
    if (params.error || params.traceback || params.stack || params.exception) {
      return 'error_traceback';
    }
    return 'generic';
  }

  private static extractBaseParams(params: any): BaseEventParams {
    const base: BaseEventParams = {};
    if (params.eventId) base.eventId = params.eventId;
    if (params.parentEventId) base.parentEventId = params.parentEventId;
    if (params.occurredAt) base.occurredAt = params.occurredAt;
    if (params.duration !== undefined) base.duration = params.duration;
    if (params.tags) base.tags = params.tags;
    if (params.metadata) base.metadata = params.metadata;
    if (params.screenshots) base.screenshots = params.screenshots;
    return base;
  }

  private static extractMiscFields(params: any, knownFields: Set<string>): Record<string, any> | undefined {
    const misc: Record<string, any> = {};
    for (const [key, value] of Object.entries(params)) {
      if (!knownFields.has(key) && !this.BASE_FIELDS.has(key) && value !== undefined) {
        misc[key] = value;
      }
    }
    return Object.keys(misc).length > 0 ? misc : undefined;
  }

  private static buildLLMEvent(params: FlexibleEventParams): LLMGenerationEventParams {
    const base = this.extractBaseParams(params);
    const request: any = { provider: params.provider || 'unknown', model: params.model || 'unknown' };
    if (params.messages) request.messages = params.messages;
    else if (params.prompt) request.messages = [{ role: 'user', content: params.prompt }];
    if (params.params) request.params = params.params;

    const response: any = {};
    if (params.output !== undefined) response.output = params.output;
    if (params.tool_calls) response.tool_calls = params.tool_calls;
    if (params.thinking) response.thinking = params.thinking;
    if (params.raw) response.raw = params.raw;

    const usage: any = {};
    if (params.input_tokens !== undefined) usage.input_tokens = params.input_tokens;
    if (params.output_tokens !== undefined) usage.output_tokens = params.output_tokens;
    if (params.cache !== undefined) usage.cache = params.cache;
    if (params.cost !== undefined) usage.cost = params.cost;

    const payload: LLMGenerationPayload = { request, response };
    if (Object.keys(usage).length > 0) payload.usage = usage;
    if (params.status) payload.status = params.status;
    if (params.error) payload.error = String(params.error);

    const misc = this.extractMiscFields(params, this.LLM_FIELDS);
    if (misc) payload.misc = misc;

    return { type: 'llm_generation', ...base, payload };
  }

  private static buildFunctionEvent(params: FlexibleEventParams): FunctionCallEventParams {
    const base = this.extractBaseParams(params);
    const payload: FunctionCallPayload = { function_name: params.function_name || 'unknown' };
    if (params.arguments !== undefined) payload.arguments = params.arguments;
    if (params.return_value !== undefined) payload.return_value = params.return_value;
    const misc = this.extractMiscFields(params, this.FUNCTION_FIELDS);
    if (misc) payload.misc = misc;
    return { type: 'function_call', ...base, payload };
  }

  private static buildErrorEvent(params: FlexibleEventParams): ErrorTracebackEventParams {
    const base = this.extractBaseParams(params);
    let errorStr: string; let traceback: string | undefined;
    if (params.error instanceof Error) { errorStr = params.error.message; traceback = params.error.stack; }
    else { errorStr = String(params.error || 'Unknown error'); traceback = params.traceback; }
    const payload: ErrorTracebackPayload = { error: errorStr, traceback: traceback || '' };
    const misc = this.extractMiscFields(params, this.ERROR_FIELDS);
    if (misc) payload.misc = misc;
    return { type: 'error_traceback', ...base, payload };
  }

  private static buildGenericEvent(params: FlexibleEventParams): GenericEventParams {
    const base = this.extractBaseParams(params);
    const payload: GenericEventPayload = { details: params.details || '' };
    const misc = this.extractMiscFields(params, this.GENERIC_FIELDS);
    if (misc) payload.misc = misc;
    return { ...base, payload };
  }
}


