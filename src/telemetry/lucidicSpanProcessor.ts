import { 
  Span, 
  SpanProcessor, 
  ReadableSpan
} from '@opentelemetry/sdk-trace-base';
import { SpanStatusCode, SpanKind, Context } from '@opentelemetry/api';
import { Client } from '../client';
import { logger } from '../utils/logger';
import { calculateCost } from '../utils/modelPricing';
import { getStoredImages, clearStoredImages } from './utils/imageStorage';
import { getStoredText, clearStoredTexts } from './utils/textStorage';
import { SPAN_ATTRIBUTES, DEBUG } from '../constants';
import { EventConfig } from '../types';

interface SpanContext {
  startTime: number;
  name: string;
  attributes: Record<string, any>;
  span: Span;
}

export class LucidicSpanProcessor implements SpanProcessor {
  private spanToEvent: Map<string, string> = new Map();
  private spanContexts: Map<string, SpanContext> = new Map();
  private getClient: () => Client | null;

  constructor(clientGetter: () => Client | null) {
    this.getClient = clientGetter;
  }

  onStart(span: Span, parentContext?: Context): void {
    try {
      if (DEBUG) {
        logger.debug(`[SpanProcessor] on_start called for span: ${span.name}`);
        logger.debug(`[SpanProcessor] Span attributes at start:`, span.attributes);
        logger.debug(`[SpanProcessor] Span kind: ${span.kind}`);
      }

      const client = this.getClient();
      if (!client || !client.session) {
        if (DEBUG) {
          logger.debug('[SpanProcessor] No active session, skipping span tracking');
        }
        return;
      }

      // Only process LLM spans
      if (!this.isLLMSpan(span)) {
        if (DEBUG) {
          logger.debug(`[SpanProcessor] Skipping non-LLM span: ${span.name}`);
        }
        return;
      }
      
      // Add step context if available
      if (client.session?.activeStep) {
        span.setAttribute(SPAN_ATTRIBUTES.LUCIDIC_STEP_ID, client.session.activeStep.stepId);
      }

      // Store span info for processing
      const spanId = span.spanContext().spanId;
      this.spanContexts.set(spanId, {
        startTime: span.startTime[0] * 1000 + span.startTime[1] / 1000000,
        name: span.name,
        attributes: { ...span.attributes },
        span
      });

      if (DEBUG) {
        logger.debug(`[SpanProcessor] Stored span ${spanId} for later processing`);
      }
    } catch (error) {
      logger.error(`Error in onStart: ${error}`);
      if (DEBUG && error instanceof Error) {
        logger.error(error.stack);
      }
    }
  }

  onEnd(span: ReadableSpan): void {
    try {
      const spanId = span.spanContext().spanId;

      if (DEBUG) {
        logger.debug(`[SpanProcessor] on_end called for span: ${span.name}`);
        logger.debug(`[SpanProcessor] Span attributes at end:`, span.attributes);
        logger.debug(`[SpanProcessor] Tracked span contexts:`, Array.from(this.spanContexts.keys()));
      }

      // Check if we have context for this span
      if (!this.spanContexts.has(spanId)) {
        if (DEBUG) {
          logger.warn(`[SpanProcessor] No context found for span ${spanId}`);
        }
        return;
      }

      const client = this.getClient();
      if (!client || !client.session) {
        return;
      }

      const spanContext = this.spanContexts.get(spanId);
      this.spanContexts.delete(spanId);

      // Create event with all the attributes now available
      this.createEventFromSpanEnd(span).catch(error => {
        logger.error(`Failed to create event from span: ${error}`);
      });

      if (DEBUG) {
        logger.debug(`[SpanProcessor] Created and completed event for span ${spanId}`);
      }

      // Clear thread-local images and texts after processing
      clearStoredImages();
      clearStoredTexts();
    } catch (error) {
      logger.error(`Error in onEnd: ${error}`);
      if (DEBUG && error instanceof Error) {
        logger.error(error.stack);
      }
    }
  }

  private isLLMSpan(span: Span | ReadableSpan): boolean {
    // Check if it's an agent span without LLM content
    const attributes = span.attributes || {};
    
    if (attributes['gen_ai.operation.name'] === 'agent') {
      // Check if it has actual LLM content
      const hasPrompts = Object.keys(attributes).some(k => k.toLowerCase().includes('prompt'));
      const hasCompletions = Object.keys(attributes).some(k => k.toLowerCase().includes('completion'));
      if (!hasPrompts && !hasCompletions) {
        if (DEBUG) {
          logger.debug(`[SpanProcessor] Skipping agent span without LLM content: ${span.name}`);
        }
        return false;
      }
    }

    // Check for Vercel AI SDK spans
    if (this.isVercelAISpan(span)) {
      return true;
    }

    // Check span name
    const spanNameLower = span.name.toLowerCase();
    const llmPatterns = ['openai', 'anthropic', 'chat', 'completion', 'embedding', 'gemini', 'claude'];
    
    if (llmPatterns.some(pattern => spanNameLower.includes(pattern))) {
      return true;
    }
    
    // Check attributes
    for (const key of Object.keys(attributes)) {
      if (typeof key === 'string' && (key.startsWith('gen_ai.') || key.startsWith('llm.'))) {
        return true;
      }
    }
    
    return false;
  }

  private async createEventFromSpanEnd(span: ReadableSpan): Promise<string | null> {
    try {
      const attributes = span.attributes || {};
      
      if (DEBUG) {
        logger.debug(`[SpanProcessor] Creating event from span end with ${Object.keys(attributes).length} attributes`);
      }
      
      // Extract all information
      const description = this.extractDescription(span, attributes);
      const rawResult = this.extractResult(span, attributes);
      const images = this.extractImages(attributes);
      const model = this.extractModel(attributes);
      
      // Format result
      const formattedResult = rawResult;
      
      // Apply masking
      const client = this.getClient();
      const maskedResult = client ? client.mask(formattedResult) : formattedResult;
      
      // Calculate cost
      const cost = this.calculateCost(attributes);
      
      // Check success
      const isSuccessful = span.status.code !== SpanStatusCode.ERROR;
      
      // Create event with all data
      const eventConfig: EventConfig = {
        description: description,
        result: maskedResult,
        model: model,
        isFinished: true,
        isSuccessful: isSuccessful
      };
      
      if (images.length > 0) {
        eventConfig.screenshots = images;
      }
      
      if (cost !== null) {
        eventConfig.costAdded = cost;
      }
      
      // Check for step context
      const stepId = attributes[SPAN_ATTRIBUTES.LUCIDIC_STEP_ID] as string;
      if (stepId) {
        eventConfig.stepId = stepId;
      }
      
      // Create the event
      if (DEBUG) {
        logger.debug('[SpanProcessor] Creating event with config:', eventConfig);
        logger.debug('[SpanProcessor] Event result field:', eventConfig.result);
        logger.debug('[SpanProcessor] Event result length:', eventConfig.result?.length);
      }
      
      const event = await client!.session!.createEvent(eventConfig);
      
      if (DEBUG) {
        logger.debug(`[SpanProcessor] Event created successfully: ${event.eventId}`);
      }
      
      return event.eventId;
      
    } catch (error) {
      logger.error(`Failed to create event from span end: ${error}`);
      if (DEBUG && error instanceof Error) {
        logger.error(error.stack);
      }
      return null;
    }
  }

  private extractDescription(span: ReadableSpan, attributes: Record<string, any>): string {
    if (DEBUG) {
      logger.debug(`[SpanProcessor] Extracting description from attributes:`, Object.keys(attributes));
    }
    
    // Check for Vercel AI SDK attributes
    if (this.isVercelAISpan(span)) {
      const vercelDescription = this.extractVercelAIDescription(span, attributes);
      if (vercelDescription) {
        return vercelDescription;
      }
    }
    
    // Try to reconstruct messages from indexed attributes
    const messages = this.extractIndexedMessages(attributes);
    if (messages.length > 0) {
      if (DEBUG) {
        logger.debug(`[SpanProcessor] Reconstructed ${messages.length} messages from indexed attributes`);
      }
      return this.formatMessages(messages);
    }
    
    // Try prompts first
    const prompts = attributes[SPAN_ATTRIBUTES.LLM_PROMPTS] || 
                   attributes[SPAN_ATTRIBUTES.GEN_AI_PROMPT] ||
                   attributes['llm.prompts'];
                   
    if (prompts) {
      if (DEBUG) {
        logger.debug(`[SpanProcessor] Found prompts:`, prompts);
      }
      return this.formatPrompts(prompts);
    }
    
    // Try messages
    const messages_attr = attributes['gen_ai.messages'] || attributes['llm.messages'];
    if (messages_attr) {
      if (DEBUG) {
        logger.debug(`[SpanProcessor] Found messages:`, messages_attr);
      }
      return this.formatMessages(messages_attr);
    }

    // Check for OpenAI agents tool call
    const toolName = attributes[SPAN_ATTRIBUTES.GEN_AI_TOOL_NAME];
    if (toolName) {
      if (DEBUG) {
        logger.debug(`[SpanProcessor] Found OpenAI agents tool call: ${toolName}`);
      }
      return `Agent Tool Call: ${toolName}`;
    }
    
    // Fallback
    if (DEBUG) {
      logger.debug(`[SpanProcessor] No prompts/messages found, using fallback`);
    }
    return `LLM Request: ${span.name}`;
  }

  private extractIndexedMessages(attributes: Record<string, any>): any[] {
    const messages = [];
    let i = 0;
    
    while (true) {
      const prefix = `gen_ai.prompt.${i}`;
      const role = attributes[`${prefix}.role`];
      
      if (!role) {
        break;
      }
      
      const message: any = { role };
      
      // Get content
      const content = attributes[`${prefix}.content`];
      if (content) {
        try {
          message.content = JSON.parse(content);
        } catch {
          message.content = content;
        }
      } else {
        // Check for stored text/images
        const storedText = getStoredText(i);
        const storedImages = getStoredImages();
        
        if (storedText || storedImages.length > 0) {
          if (DEBUG) {
            logger.debug(`[SpanProcessor] No content for message ${i}, but found stored text/images`);
          }
          
          const syntheticContent = [];
          
          if (storedText) {
            syntheticContent.push({
              type: 'text',
              text: storedText
            });
          }
          
          if (storedImages.length > 0 && i === 0) {
            for (const img of storedImages) {
              syntheticContent.push({
                type: 'image_url',
                image_url: { url: img }
              });
            }
          }
          
          if (syntheticContent.length > 0) {
            message.content = syntheticContent;
          }
        }
      }
      
      messages.push(message);
      i++;
    }
    
    return messages;
  }

  private extractIndexedCompletions(attributes: Record<string, any>): any[] {
    const completions = [];
    let i = 0;
    
    if (DEBUG) {
      logger.debug(`[SpanProcessor] Extracting indexed completions...`);
    }
    
    while (true) {
      const prefix = `gen_ai.completion.${i}`;
      const role = attributes[`${prefix}.role`];
      const content = attributes[`${prefix}.content`];
      
      if (!role && !content) {
        break;
      }
      
      if (DEBUG) {
        logger.debug(`[SpanProcessor] Found completion ${i}: role=${role}, content length=${content ? content.length : 0}`);
      }
      
      const completion: any = {};
      if (role) completion.role = role;
      if (content) completion.content = content;
      
      if (Object.keys(completion).length > 0) {
        completions.push(completion);
      }
      
      i++;
    }
    
    if (DEBUG) {
      logger.debug(`[SpanProcessor] Total indexed completions found: ${completions.length}`);
    }
    
    return completions;
  }

  private extractLLMIndexedCompletions(attributes: Record<string, any>): string[] {
    const completions = [];
    let i = 0;
    
    if (DEBUG) {
      logger.debug(`[SpanProcessor] Extracting LLM indexed completions...`);
    }
    
    // Try llm.completions.{i}.content format (used by Anthropic)
    while (true) {
      const content = attributes[`llm.completions.${i}.content`];
      
      if (!content) {
        break;
      }
      
      if (DEBUG) {
        logger.debug(`[SpanProcessor] Found LLM completion ${i}: content length=${content.length}`);
      }
      
      completions.push(content);
      i++;
    }
    
    if (DEBUG) {
      logger.debug(`[SpanProcessor] Total LLM indexed completions found: ${completions.length}`);
    }
    
    return completions;
  }

  private extractResult(span: ReadableSpan, attributes: Record<string, any>): string {
    if (DEBUG) {
      logger.debug(`[SpanProcessor] Extracting result from attributes`);
      logger.debug(`[SpanProcessor] Is streaming: ${attributes[SPAN_ATTRIBUTES.LLM_IS_STREAMING]}`);
      logger.debug(`[SpanProcessor] Available attribute keys: ${Object.keys(attributes).join(', ')}`);
    }

    // Check for Vercel AI SDK result
    if (this.isVercelAISpan(span)) {
      const vercelResult = this.extractVercelAIResult(span, attributes);
      if (vercelResult) {
        return vercelResult;
      }
    }

    // Try indexed completions first (gen_ai format)
    const completions = this.extractIndexedCompletions(attributes);
    if (completions.length > 0) {
      if (DEBUG) {
        logger.debug(`[SpanProcessor] Found ${completions.length} indexed completions`);
      }
      const results = completions
        .filter(comp => comp.content)
        .map(comp => String(comp.content));
      if (results.length > 0) {
        return results.join('\n');
      }
    }
    
    // Try indexed completions (llm format) - used by Anthropic
    const llmCompletions = this.extractLLMIndexedCompletions(attributes);
    if (llmCompletions.length > 0) {
      if (DEBUG) {
        logger.debug(`[SpanProcessor] Found ${llmCompletions.length} LLM indexed completions`);
      }
      return llmCompletions.join('\n');
    }
    
    // Try completions
    const completionsAttr = attributes[SPAN_ATTRIBUTES.LLM_COMPLETIONS] ||
                           attributes[SPAN_ATTRIBUTES.GEN_AI_COMPLETION] ||
                           attributes['llm.completions'];
                           
    if (completionsAttr) {
      if (Array.isArray(completionsAttr)) {
        return completionsAttr.map(c => String(c)).join('\n');
      } else {
        return String(completionsAttr);
      }
    }
    
    // Check for error
    if (span.status.code === SpanStatusCode.ERROR) {
      return `Error: ${span.status.message || 'Unknown error'}`;
    }
    
    // Check streaming
    if (attributes[SPAN_ATTRIBUTES.LLM_IS_STREAMING]) {
      const content = attributes['llm.response.content'] || attributes['gen_ai.response.content'];
      if (content) {
        return content;
      }
    }

    if (attributes[SPAN_ATTRIBUTES.GEN_AI_SYSTEM] === 'openai_agents') {
      if (DEBUG) {
        logger.debug(`[SpanProcessor] Agent Tool Call Response Received`);
      }
      return 'Agent Handoff';
    }

    return 'Response received';
  }

  private extractImages(attributes: Record<string, any>): string[] {
    const images: string[] = [];
    
    if (DEBUG) {
      logger.debug(`[SpanProcessor] Extracting images from attributes`);
    }
    
    // First check indexed messages
    const messages = this.extractIndexedMessages(attributes);
    for (const msg of messages) {
      if (typeof msg === 'object') {
        images.push(...this.extractImagesFromMessage(msg));
      }
    }
    
    // Check for multimodal content in prompts
    const prompts = attributes[SPAN_ATTRIBUTES.LLM_PROMPTS] || attributes[SPAN_ATTRIBUTES.GEN_AI_PROMPT];
    if (Array.isArray(prompts)) {
      for (const prompt of prompts) {
        if (typeof prompt === 'object') {
          images.push(...this.extractImagesFromMessage(prompt));
        }
      }
    }
    
    // Check messages too
    const messages_attr = attributes['gen_ai.messages'] || attributes['llm.messages'];
    if (Array.isArray(messages_attr)) {
      for (const msg of messages_attr) {
        if (typeof msg === 'object') {
          images.push(...this.extractImagesFromMessage(msg));
        }
      }
    }
    
    // If no images found but we have stored images, retrieve them
    const storedImages = getStoredImages();
    if (images.length === 0 && storedImages.length > 0) {
      if (DEBUG) {
        logger.debug(`[SpanProcessor] No images found in attributes, using ${storedImages.length} stored images`);
      }
      for (const img of storedImages) {
        if (img && !img.startsWith('data:')) {
          images.push(`data:image/jpeg;base64,${img}`);
        } else {
          images.push(img);
        }
      }
    }
    
    if (DEBUG && images.length > 0) {
      logger.debug(`[SpanProcessor] Extracted ${images.length} images`);
    }
    
    return images;
  }

  private extractImagesFromMessage(message: any): string[] {
    const images: string[] = [];
    const content = message.content;
    
    if (DEBUG) {
      logger.debug(`[SpanProcessor] Extracting images from message`);
    }

    // Handle case where content might be a JSON string
    let parsedContent = content;
    if (typeof content === 'string' && content.trim().startsWith('[')) {
      try {
        parsedContent = JSON.parse(content);
      } catch {
        // Keep as string if parsing fails
      }
    }

    if (Array.isArray(parsedContent)) {
      for (const item of parsedContent) {
        // Handle OpenAI format
        if (item?.type === 'image_url' && item.image_url?.url) {
          const url = item.image_url.url;
          if (url.startsWith('data:image')) {
            images.push(url);
          } else if (url.startsWith('lucidic_image_')) {
            // This is a placeholder - would need to retrieve from storage
            // For now, skip it
          }
        }
        // Handle Anthropic format
        else if (item?.type === 'image' && item.source?.data) {
          const base64Data = item.source.data;
          const mediaType = item.source.media_type || 'image/jpeg';
          
          // Check if it's a placeholder or actual data
          if (base64Data.startsWith('lucidic_image_')) {
            // This is a placeholder - would need to retrieve from storage
            // For now, skip it
          } else {
            // Construct data URI
            const dataUri = `data:${mediaType};base64,${base64Data}`;
            images.push(dataUri);
          }
        }
      }
    }
    
    return images;
  }

  private extractModel(attributes: Record<string, any>): string {
    // Check Vercel AI SDK attributes first
    if (attributes['ai.model.id']) {
      // Vercel AI SDK format: ai.model.id contains the model name
      // ai.model.provider contains the provider (e.g., 'openai')
      const modelId = attributes['ai.model.id'];
      const provider = attributes['ai.model.provider'];
      
      // Return in a format compatible with cost calculation
      if (provider === 'openai' && modelId) {
        return modelId; // e.g., 'gpt-4o'
      }
      
      return modelId || 'unknown';
    }
    
    // Fallback to OpenLLMetry attributes
    return attributes[SPAN_ATTRIBUTES.LLM_RESPONSE_MODEL] ||
           attributes[SPAN_ATTRIBUTES.LLM_REQUEST_MODEL] ||
           attributes['gen_ai.response.model'] ||
           attributes['gen_ai.request.model'] ||
           'unknown';
  }

  private formatPrompts(prompts: any): string {
    if (typeof prompts === 'string') {
      return prompts;
    } else if (Array.isArray(prompts)) {
      return this.formatMessages(prompts);
    } else {
      return 'Model request';
    }
  }

  private formatMessages(messages: any[]): string {
    const formatted: string[] = [];
    
    for (const msg of messages) {
      if (typeof msg === 'object' && msg !== null) {
        const role = msg.role || 'unknown';
        const content = msg.content || '';
        
        if (typeof content === 'string') {
          formatted.push(`${role}: ${content}`);
        } else if (Array.isArray(content)) {
          // Extract text from multimodal
          const texts = content
            .filter((item: any) => item?.type === 'text')
            .map((item: any) => item.text || '');
          if (texts.length > 0) {
            formatted.push(`${role}: ${texts.join(' ')}`);
          }
        }
      } else if (typeof msg === 'string') {
        formatted.push(msg);
      }
    }
    
    return formatted.length > 0 ? formatted.join('\n') : 'Model request';
  }

  private calculateCost(attributes: Record<string, any>): number | null {
    // Check for Vercel AI SDK usage attributes
    const vercelPromptTokens = attributes['ai.usage.inputTokens'];
    const vercelCompletionTokens = attributes['ai.usage.outputTokens'];
    
    const promptTokens = vercelPromptTokens ||
                        attributes[SPAN_ATTRIBUTES.LLM_USAGE_PROMPT_TOKENS] ||
                        attributes['gen_ai.usage.prompt_tokens'] ||
                        attributes['gen_ai.usage.input_tokens'] ||
                        0;
    
    const completionTokens = vercelCompletionTokens ||
                            attributes[SPAN_ATTRIBUTES.LLM_USAGE_COMPLETION_TOKENS] ||
                            attributes['gen_ai.usage.completion_tokens'] ||
                            attributes['gen_ai.usage.output_tokens'] ||
                            0;
    
    const totalTokens = Number(promptTokens) + Number(completionTokens);
    
    if (totalTokens > 0) {
      const model = this.extractModel(attributes);
      
      if (model && model !== 'unknown') {
        return calculateCost(model, {
          prompt_tokens: Number(promptTokens),
          completion_tokens: Number(completionTokens),
          total_tokens: totalTokens
        });
      }
    }
    
    return null;
  }

  shutdown(): Promise<void> {
    if (this.spanToEvent.size > 0) {
      logger.warn(`Shutting down with ${this.spanToEvent.size} incomplete spans`);
    }
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  private isVercelAISpan(span: Span | ReadableSpan): boolean {
    const spanName = span.name;
    const attributes = span.attributes || {};
    
    // Check for Vercel AI SDK span patterns
    const vercelAIPatterns = [
      'ai.generateText',
      'ai.streamText',
      'ai.generateObject',
      'ai.streamObject',
      'ai.embed',
      'ai.embedMany',
      'ai.toolCall'
    ];
    
    if (vercelAIPatterns.some(pattern => spanName.startsWith(pattern))) {
      if (DEBUG) {
        logger.debug(`[SpanProcessor] Detected Vercel AI SDK span: ${spanName}`);
      }
      return true;
    }
    
    // Check for attributes that indicate Vercel AI SDK
    if (attributes['ai.model.id'] || attributes['ai.model.provider']) {
      if (DEBUG) {
        logger.debug(`[SpanProcessor] Detected Vercel AI SDK span by attributes: ${spanName}`);
      }
      return true;
    }
    
    return false;
  }

  private extractVercelAIDescription(span: ReadableSpan, attributes: Record<string, any>): string | null {
    if (DEBUG) {
      logger.debug(`[SpanProcessor] Extracting Vercel AI SDK description from span: ${span.name}`);
    }

    // Handle prompt/messages from Vercel AI SDK telemetry
    if (attributes['ai.prompt.messages']) {
      try {
        const messages = JSON.parse(attributes['ai.prompt.messages']);
        if (Array.isArray(messages)) {
          return this.formatMessages(messages);
        }
      } catch (e) {
        if (DEBUG) {
          logger.debug(`[SpanProcessor] Failed to parse ai.prompt.messages:`, e);
        }
      }
    }

    // Handle single prompt
    if (attributes['ai.prompt']) {
      return `Prompt: ${attributes['ai.prompt']}`;
    }

    // Handle tool calls
    if (span.name.includes('toolCall') && attributes['ai.toolCall.name']) {
      const toolName = attributes['ai.toolCall.name'];
      const toolId = attributes['ai.toolCall.id'];
      return `Tool Call: ${toolName}${toolId ? ` (${toolId})` : ''}`;
    }

    // Construct description from operation type
    const operationType = span.name.split('.').slice(1).join('.');
    const modelId = attributes['ai.model.id'] || 'unknown model';
    
    return `Vercel AI ${operationType}: ${modelId}`;
  }

  private extractVercelAIResult(span: ReadableSpan, attributes: Record<string, any>): string | null {
    if (DEBUG) {
      logger.debug(`[SpanProcessor] Extracting Vercel AI SDK result from span: ${span.name}`);
    }

    // Handle text generation result
    if (attributes['ai.response.text']) {
      return attributes['ai.response.text'];
    }

    // Handle object generation result
    if (attributes['ai.response.object']) {
      try {
        const obj = JSON.parse(attributes['ai.response.object']);
        return JSON.stringify(obj, null, 2);
      } catch {
        return attributes['ai.response.object'];
      }
    }

    // Handle embedding result
    if (attributes['ai.embedding'] || attributes['ai.embeddings']) {
      const embeddings = attributes['ai.embeddings'] || [attributes['ai.embedding']];
      return `Generated ${embeddings.length} embedding(s)`;
    }

    // Handle tool call result
    if (attributes['ai.toolCall.result']) {
      try {
        const result = JSON.parse(attributes['ai.toolCall.result']);
        return JSON.stringify(result, null, 2);
      } catch {
        return attributes['ai.toolCall.result'];
      }
    }

    // Handle finish reason
    if (attributes['ai.response.finishReason']) {
      return `Finished: ${attributes['ai.response.finishReason']}`;
    }

    return null;
  }
}