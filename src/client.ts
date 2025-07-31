import axios, { AxiosInstance, AxiosError } from 'axios';
import FormData from 'form-data';
import { v4 as uuidv4 } from 'uuid';
import { APIError, ConfigurationError } from './errors';
import { logger } from './utils/logger';
import { 
  LucidicConfig, 
  APIResponse, 
  SessionResponse, 
  StepResponse, 
  EventResponse,
  PromptResponse,
  ImageUploadResponse,
  SessionConfig,
  StepConfig,
  EventConfig,
  MassSimulationConfig
} from './types';
import { API_BASE_URL, API_TIMEOUT, MAX_RETRIES, RETRY_DELAY } from './constants';
import { Session } from './primitives/session';
import { uploadImageToS3 } from './utils/imageUpload';

export class Client {
  private apiKey: string;
  private apiUrl: string;
  private axios: AxiosInstance;
  private agentId: string;
  public session: Session | null = null;
  public maskingFunction: ((text: string) => string) | null = null;
  private promptCache: Map<string, { prompt: string; timestamp: number }> = new Map();
  private readonly PROMPT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private initialized: boolean = false;
  public autoEnd: boolean = true;

  constructor(config?: LucidicConfig) {
    this.apiKey = config?.apiKey || process.env.LUCIDIC_API_KEY || '';
    // Use local URL if debug mode is enabled
    this.apiUrl = config?.apiUrl || (process.env.LUCIDIC_DEBUG === 'True' ? 'http://localhost:8000/api' : API_BASE_URL);
    this.agentId = config?.agentId || process.env.LUCIDIC_AGENT_ID || '';
    this.maskingFunction = config?.maskingFunction || null;
    
    // Set autoEnd from config or environment variable (default true)
    const envAutoEnd = process.env.LUCIDIC_AUTO_END;
    if (config?.autoEnd !== undefined) {
      this.autoEnd = config.autoEnd;
    } else if (envAutoEnd !== undefined) {
      this.autoEnd = envAutoEnd.toLowerCase() !== 'false';
    } else {
      this.autoEnd = true;
    }

    if (!this.apiKey) {
      throw new ConfigurationError('API key is required. Set LUCIDIC_API_KEY environment variable or pass apiKey in config.');
    }

    if (!this.agentId) {
      throw new ConfigurationError('Agent ID is required. Set LUCIDIC_AGENT_ID environment variable or pass agentId in config.');
    }
    

    // Initialize axios with retry logic
    this.axios = axios.create({
      baseURL: this.apiUrl,
      timeout: API_TIMEOUT,
      headers: {
        'Authorization': `Api-Key ${this.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'lucidic-sdk/1.0'
      }
    });

    // Add request/response interceptors for logging
    if (logger.level === 'debug') {
      this.axios.interceptors.request.use(request => {
        logger.debug(`API Request: ${request.method?.toUpperCase()} ${request.url}`, {
          data: request.data
        });
        return request;
      });

      this.axios.interceptors.response.use(
        response => {
          logger.debug(`API Response: ${response.status} ${response.config.url}`, {
            data: response.data
          });
          return response;
        },
        error => {
          logger.debug(`API Error: ${error.response?.status} ${error.config?.url}`, {
            error: error.response?.data
          });
          return Promise.reject(error);
        }
      );
    }
  }

  /**
   * Initialize the client and verify API key
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await this.verifyApiKey();
      this.initialized = true;
    } catch (error) {
      throw new APIError('Failed to initialize client: ' + (error as Error).message);
    }
  }

  /**
   * Verify the API key is valid
   */
  private async verifyApiKey(): Promise<void> {
    try {
      logger.debug('Verifying API key...', {
        apiUrl: this.apiUrl,
        apiKeyPrefix: this.apiKey.substring(0, 10) + '...'
      });
      
      const response = await this.request<{ project: string; project_id: string }>(
        'GET',
        '/verifyapikey',
        {}
      );
      logger.info(`API key verified for project: ${response.project}`);
    } catch (error) {
      logger.error('API key verification failed:', error);
      throw new APIError('Invalid API key', 401);
    }
  }

  /**
   * Apply masking function to text if configured
   */
  public mask(text: string): string {
    if (this.maskingFunction) {
      return this.maskingFunction(text);
    }
    return text;
  }

  /**
   * Make API request with retry logic
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    data?: any,
    options?: any
  ): Promise<T> {
    let lastError: Error | null = null;

    // Add current_time to all requests
    const requestData = {
      ...data,
      current_time: new Date().toISOString()
    };

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const config: any = {
          method,
          url: endpoint,
          ...options
        };

        // For GET requests, pass data as params
        if (method === 'GET') {
          config.params = requestData;
        } else {
          config.data = requestData;
        }

        const response = await this.axios.request<APIResponse<T>>(config);
        
        logger.debug(`API Response [${method} ${endpoint}]:`, {
          status: response.status,
          data: response.data
        });

        // Check if the response has the expected structure
        if (response.data && typeof response.data === 'object' && 'success' in response.data) {
          if (response.data.success === false) {
            throw new APIError(response.data.error || 'API request failed', response.status);
          }
          return response.data.data as T;
        } else {
          // For endpoints that return data directly (like verifyapikey)
          return response.data as T;
        }
      } catch (error) {
        lastError = error as Error;

        if (error instanceof AxiosError) {
          const status = error.response?.status;
          
          logger.debug(`Request failed [${method} ${endpoint}]:`, {
            status,
            message: error.message,
            responseData: error.response?.data,
            code: error.code
          });
          
          // Don't retry on 4xx errors (except 429)
          if (status && status >= 400 && status < 500 && status !== 429) {
            throw new APIError(
              error.response?.data?.error || error.message,
              status,
              error.response?.data
            );
          }

          // For retryable errors, wait before retrying
          if (attempt < MAX_RETRIES - 1) {
            const delay = RETRY_DELAY * Math.pow(2, attempt); // Exponential backoff
            logger.warn(`API request failed, retrying in ${delay}ms...`, {
              attempt: attempt + 1,
              error: error.message
            });
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }

        throw new APIError(
          lastError.message || 'API request failed',
          error instanceof AxiosError ? error.response?.status : undefined
        );
      }
    }

    throw new APIError(lastError?.message || 'Max retries exceeded');
  }

  /**
   * Initialize a new session
   */
  public async initSession(config: SessionConfig): Promise<Session> {
    if (!this.initialized) {
      await this.initialize();
    }

    const sessionData = {
      agent_id: this.agentId,
      session_name: config.sessionName || 'Unnamed Session',
      task: config.task,
      mass_sim_id: config.massSimId,
      rubrics: config.rubrics,
      tags: config.tags,
      production_monitoring: config.productionMonitoring || false
    };

    const response = await this.request<SessionResponse>('POST', '/initsession', sessionData);
    
    this.session = new Session(this, {
      ...config,
      sessionId: response.session_id,
      agentId: response.agent_id || this.agentId
    });

    logger.info(`Session initialized: ${response.session_id}`);
    return this.session;
  }

  /**
   * Continue an existing session
   */
  public async continueSession(sessionId: string): Promise<Session> {
    const response = await this.request<SessionResponse>('POST', '/continuesession', {
      session_id: sessionId
    });

    this.session = new Session(this, {
      sessionId: response.session_id,
      agentId: response.agent_id || this.agentId
    });

    logger.info(`Session continued: ${response.session_id}`);
    return this.session;
  }

  /**
   * Update session
   */
  public async updateSession(
    sessionId: string,
    isFinished?: boolean,
    isSuccessful?: boolean,
    isSuccessfulReason?: string,
    task?: string,
    sessionEval?: number,
    sessionEvalReason?: string,
    tags?: string[]
  ): Promise<void> {
    await this.request('PUT', '/updatesession', {
      session_id: sessionId,
      is_finished: isFinished,
      is_successful: isSuccessful,
      is_successful_reason: isSuccessfulReason,
      task,
      session_eval: sessionEval,
      session_eval_reason: sessionEvalReason,
      tags
    });
  }

  /**
   * Create a new step
   */
  public async createStep(config: StepConfig & { sessionId: string }): Promise<string> {
    const response = await this.request<StepResponse>('POST', '/initstep', {
      session_id: config.sessionId
    });

    // If initial state/action/goal provided, update the step
    if (config.state || config.action || config.goal) {
      await this.updateStep(
        response.step_id,
        false,
        undefined,
        undefined,
        config.state,
        config.action,
        config.goal
      );
    }

    return response.step_id;
  }

  /**
   * Update a step
   */
  public async updateStep(
    stepId: string,
    isFinished?: boolean,
    evalScore?: number,
    evalDescription?: string,
    state?: string,
    action?: string,
    goal?: string
  ): Promise<void> {
    await this.request('PUT', '/updatestep', {
      step_id: stepId,
      is_finished: isFinished,
      eval_score: evalScore,
      eval_description: evalDescription,
      state,
      action,
      goal
    });
  }

  /**
   * Create a new event
   */
  public async createEvent(config: EventConfig & { sessionId: string }): Promise<string> {
    const response = await this.request<EventResponse>('POST', '/initevent', {
      session_id: config.sessionId,
      step_id: config.stepId
    });

    // Handle image uploads if screenshots are provided
    let nscreenshots = 0;
    if (config.screenshots && config.screenshots.length > 0) {
      logger.debug(`Uploading ${config.screenshots.length} screenshots for event ${response.event_id}`);
      
      for (let i = 0; i < config.screenshots.length; i++) {
        try {
          // Get presigned URL
          const { presignedUrl } = await this.getPresignedUploadUrl({
            agentId: this.agentId,
            sessionId: config.sessionId,
            eventId: response.event_id,
            nthScreenshot: i
          });
          
          // Upload image
          await uploadImageToS3(presignedUrl, config.screenshots[i], 'JPEG');
          nscreenshots++;
          
          logger.debug(`Uploaded screenshot ${i + 1}/${config.screenshots.length}`);
        } catch (error) {
          logger.error(`Failed to upload screenshot ${i}:`, error);
          // Continue with other screenshots even if one fails
        }
      }
    }

    // If additional data provided, update the event
    if (config.description || config.result || config.model || nscreenshots > 0 || 
        config.isFinished !== undefined || config.costAdded !== undefined) {
      await this.updateEvent(
        response.event_id,
        config.result,
        config.isFinished,
        config.costAdded,
        config.model,
        config.description,
        nscreenshots > 0 ? nscreenshots : undefined
      );
    }

    return response.event_id;
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
    description?: string,
    nscreenshots?: number
  ): Promise<void> {
    await this.request('PUT', '/updateevent', {
      event_id: eventId,
      result,
      is_finished: isFinished,
      cost_added: costAdded,
      model,
      description,
      nscreenshots
    });
  }

  /**
   * Get a prompt from the platform
   */
  public async getPrompt(promptName: string, cacheTtl: number = 300, label: string = 'production'): Promise<string> {
    const cacheKey = `${promptName}:${label}`;
    
    // Check cache first
    if (cacheTtl !== 0) {
      const cached = this.promptCache.get(cacheKey);
      if (cached) {
        const age = (Date.now() - cached.timestamp) / 1000; // age in seconds
        const effectiveTtl = cacheTtl === -1 ? Infinity : cacheTtl;
        if (age < effectiveTtl) {
          return cached.prompt;
        }
      }
    }

    try {
      const params = new URLSearchParams({
        agent_id: this.agentId,
        prompt_name: promptName,
        label: label
      });
      const response = await this.request<PromptResponse>('GET', `/getprompt?${params.toString()}`);
      const prompt = response.prompt_content;

      // Cache the prompt if caching is enabled
      if (cacheTtl !== 0) {
        this.promptCache.set(cacheKey, {
          prompt,
          timestamp: Date.now()
        });
      }

      return prompt;
    } catch (error) {
      logger.error(`Failed to fetch prompt '${promptName}':`, error);
      throw error;
    }
  }

  /**
   * Upload an image
   */
  public async uploadImage(imageData: Buffer | string): Promise<string> {
    const formData = new FormData();
    
    // If string, assume it's base64
    if (typeof imageData === 'string') {
      const buffer = Buffer.from(imageData.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      formData.append('file', buffer, {
        filename: 'image.png',
        contentType: 'image/png'
      });
    } else {
      formData.append('file', imageData, {
        filename: 'image.png',
        contentType: 'image/png'
      });
    }

    const response = await this.request<ImageUploadResponse>(
      'POST',
      '/upload-image',
      formData,
      {
        headers: formData.getHeaders()
      }
    );

    return response.image_url;
  }

  /**
   * Initialize mass simulation
   */
  public async initMassSimulation(baseName: string, numSessions: number): Promise<string[]> {
    const response = await this.request<{ session_ids: string[] }>('POST', '/initmasssim', {
      agent_id: this.agentId,
      base_name: baseName,
      num_sessions: numSessions
    });

    return response.session_ids;
  }

  /**
   * Run mass simulation
   */
  public async runMassSimulation(config: MassSimulationConfig): Promise<void> {
    logger.info(`Starting mass simulation: ${config.numSessions} sessions`);

    const sessionIds = await this.initMassSimulation(config.sessionBaseName, config.numSessions);

    // Run sessions in parallel batches
    const BATCH_SIZE = 10;
    for (let i = 0; i < sessionIds.length; i += BATCH_SIZE) {
      const batch = sessionIds.slice(i, i + BATCH_SIZE);
      
      await Promise.all(
        batch.map(async (sessionId, index) => {
          try {
            logger.info(`Running simulation ${i + index + 1}/${config.numSessions}`);
            
            // Continue the pre-created session
            await this.continueSession(sessionId);
            
            // Run the session function
            await config.sessionFunction();
            
            // End session
            if (this.session) {
              await this.session.endSession(true);
            }
          } catch (error) {
            logger.error(`Simulation ${i + index + 1} failed:`, error);
          }
        })
      );
    }

    logger.info('Mass simulation completed');
  }

  /**
   * Get the current agent ID
   */
  public getAgentId(): string {
    return this.agentId;
  }

  /**
   * Check if client is initialized
   */
  public getIsInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Clear prompt cache
   */
  public clearPromptCache(): void {
    this.promptCache.clear();
  }

  /**
   * Get presigned URL for S3 upload
   */
  public async getPresignedUploadUrl(params: {
    agentId: string;
    stepId?: string;
    sessionId?: string;
    eventId?: string;
    nthScreenshot?: number;
  }): Promise<{
    presignedUrl: string;
    bucketName: string;
    objectKey: string;
  }> {
    const response = await this.request<{
      presigned_url: string;
      bucket_name: string;
      object_key: string;
    }>('GET', '/getpresigneduploadurl', {
      agent_id: params.agentId,
      step_id: params.stepId,
      session_id: params.sessionId,
      event_id: params.eventId,
      nth_screenshot: params.nthScreenshot
    });

    return {
      presignedUrl: response.presigned_url,
      bucketName: response.bucket_name,
      objectKey: response.object_key
    };
  }
}