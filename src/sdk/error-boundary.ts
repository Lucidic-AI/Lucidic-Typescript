import { debug, error as logError, warn } from '../util/logger';

/**
 * Context information about where an error occurred
 */
export interface ErrorContext {
  functionName: string;
  moduleName: string;
  args: any[];
  error: unknown;
  timestamp: Date;
}

/**
 * Classification of SDK operations for handling strategy
 */
enum OperationType {
  INITIALIZATION = 'initialization',
  EVENT_CREATION = 'event_creation',
  SESSION_OPERATION = 'session_operation',
  DATA_FETCH = 'data_fetch',
  TELEMETRY = 'telemetry',
  UTILITY = 'utility',
}

/**
 * SDK Error Boundary - Prevents SDK errors from crashing user applications
 * 
 * Controlled by environment variable:
 * - LUCIDIC_SILENT_MODE="true" (default): Swallow errors and perform emergency shutdown
 * - LUCIDIC_SILENT_MODE="false": Let errors propagate normally
 */
class SdkErrorBoundary {
  private readonly silentMode: boolean;
  private shutdownInProgress = false;
  private hasPerformedShutdown = false;
  private errorHistory: ErrorContext[] = [];
  private wrappedModules = new WeakMap<object, object>();
  private functionCache = new WeakMap<Function, Function>();
  private operationClassifier = new OperationClassifier();
  
  constructor() {
    // Read configuration from environment at construction time
    const envValue = process.env.LUCIDIC_SILENT_MODE?.toLowerCase();
    
    // Default to true (silent mode ON)
    this.silentMode = envValue !== 'false';
    
    if (this.silentMode) {
      debug('SDK error boundary enabled - errors will be swallowed with emergency shutdown');
    } else {
      debug('SDK error boundary disabled - errors will propagate to user code');
    }
  }

  /**
   * Wraps a module with error boundary protection
   */
  wrapModule<T extends object>(module: T, moduleName: string): T {
    // Fast path: if not in silent mode, return original module
    if (!this.silentMode) {
      return module;
    }

    // Check cache
    const cached = this.wrappedModules.get(module);
    if (cached) return cached as T;

    const wrapped = this.createModuleProxy(module, moduleName);
    this.wrappedModules.set(module, wrapped);
    return wrapped;
  }

  private createModuleProxy<T extends object>(module: T, moduleName: string): T {
    const self = this;

    return new Proxy(module, {
      get(target, prop, receiver) {
        // Skip symbols, private properties, and constructors
        if (typeof prop === 'symbol' || 
            (typeof prop === 'string' && prop.startsWith('_')) ||
            prop === 'constructor') {
          return Reflect.get(target, prop, receiver);
        }

        const value = Reflect.get(target, prop, receiver);
        
        // Wrap functions
        if (typeof value === 'function') {
          return self.wrapFunction(
            value, 
            String(prop), 
            moduleName,
            target
          );
        }

        // Recursively wrap nested objects (but not arrays, dates, regexps, etc)
        if (value && 
            typeof value === 'object' && 
            !Array.isArray(value) &&
            !(value instanceof Date) &&
            !(value instanceof RegExp) &&
            !(value instanceof Promise)) {
          return self.wrapModule(value, `${moduleName}.${String(prop)}`);
        }

        return value;
      },

      set(target, prop, value, receiver) {
        // If setting a function, wrap it
        if (typeof value === 'function' && typeof prop === 'string' && !prop.startsWith('_')) {
          const wrapped = self.wrapFunction(
            value,
            prop,
            moduleName,
            target
          );
          return Reflect.set(target, prop, wrapped, receiver);
        }
        return Reflect.set(target, prop, value, receiver);
      }
    });
  }

  private wrapFunction(
    fn: Function,
    fnName: string,
    moduleName: string,
    thisContext: any
  ): Function {
    // Check cache first
    const cached = this.functionCache.get(fn);
    if (cached) return cached;

    // Skip certain functions that should never be wrapped
    if (this.shouldSkipWrapping(fnName, moduleName)) {
      return fn;
    }

    const self = this;
    const operationType = this.operationClassifier.classify(moduleName, fnName);
    
    // Detect if function is async
    const isAsync = fn.constructor.name === 'AsyncFunction' ||
                    fnName.toLowerCase().includes('async');

    // Create named wrapper for better stack traces
    const wrapper = {
      [fnName]: function(this: any, ...args: any[]) {
        // If we've already shutdown, return fallback immediately
        if (self.hasPerformedShutdown) {
          return self.getFallbackValue(fnName, operationType);
        }

        // Execute with error handling
        const execute = async (): Promise<any> => {
          const context: ErrorContext = {
            functionName: fnName,
            moduleName,
            args: self.sanitizeArgs(args),
            error: null,
            timestamp: new Date()
          };

          try {
            const result = fn.apply(this || thisContext, args);

            // Handle promises/async functions
            if (result && typeof result.then === 'function') {
              return await result;
            }
            return result;

          } catch (error) {
            context.error = error;
            
            // Log the error
            self.logError(context, operationType);
            
            // Collect in history
            self.collectError(context);
            
            // Trigger emergency shutdown (async, don't await)
            if (!self.shutdownInProgress && !self.hasPerformedShutdown) {
              self.triggerEmergencyShutdown(context);
            }
            
            // Return fallback value
            return self.getFallbackValue(fnName, operationType);
          }
        };

        // Execute
        const result = execute();
        
        // For sync functions, we need to handle the Promise
        if (!isAsync && result instanceof Promise) {
          // In silent mode, we make everything potentially async
          // This is a tradeoff for simplicity and consistency
          return result;
        }
        
        return result;
      }
    }[fnName];

    // Preserve function properties
    Object.setPrototypeOf(wrapper, Object.getPrototypeOf(fn));
    Object.defineProperties(wrapper, {
      length: { value: fn.length },
      name: { value: fnName }
    });

    // Cache the wrapper
    this.functionCache.set(fn, wrapper);
    
    return wrapper;
  }

  private shouldSkipWrapping(fnName: string, moduleName: string): boolean {
    // These are frequently called getters that rarely fail
    // Skipping them improves performance
    const skipList = [
      'getSessionId',
      'getAgentId', 
      'getHttp',
      'getMask',
      'getPromptResource',
      'getEventQueue',
      'hasHttp',
      'getAgentIdSafe',
      'getDecoratorContext',
      'getActiveSessionFromAls'
    ];
    
    return skipList.includes(fnName);
  }

  private sanitizeArgs(args: any[]): any[] {
    // Limit args to prevent memory issues and sensitive data exposure
    return args.slice(0, 3).map(arg => {
      if (arg === null || arg === undefined) return arg;
      if (typeof arg === 'string') {
        // Truncate long strings and mask potential secrets
        if (arg.length > 100) return arg.substring(0, 100) + '...';
        if (arg.toLowerCase().includes('key') || 
            arg.toLowerCase().includes('token') ||
            arg.toLowerCase().includes('secret')) {
          return '<redacted>';
        }
        return arg;
      }
      if (typeof arg === 'object') {
        return `<${arg.constructor?.name || 'object'}>`;
      }
      if (typeof arg === 'function') {
        return '<function>';
      }
      return arg;
    });
  }

  private logError(context: ErrorContext, operationType: OperationType): void {
    // Use appropriate log level based on operation type
    const message = `SDK Error in ${context.moduleName}.${context.functionName} (${operationType})`;
    
    // Only log if debug/verbose mode is enabled (controlled by logger module)
    if (operationType === OperationType.TELEMETRY || 
        operationType === OperationType.UTILITY) {
      debug(message, context.error);
    } else {
      warn(message, context.error);
    }
  }

  private collectError(context: ErrorContext): void {
    this.errorHistory.push({ ...context });
    
    // Limit history size to prevent memory leaks
    if (this.errorHistory.length > 100) {
      this.errorHistory = this.errorHistory.slice(-50);
    }
  }

  private getFallbackValue(functionName: string, operationType: OperationType): any {
    // Return appropriate fallback based on operation type
    switch (operationType) {
      case OperationType.INITIALIZATION:
        // For init, return a fake session ID so app can continue
        if (functionName === 'init') {
          return `fallback-session-${Date.now()}`;
        }
        return undefined;
      
      case OperationType.EVENT_CREATION:
        // Events return undefined (event not created)
        return undefined;
      
      case OperationType.SESSION_OPERATION:
        // Session operations return void/undefined
        return undefined;
      
      case OperationType.DATA_FETCH:
        // Data fetches return empty data
        if (functionName.includes('Dataset')) return { items: [] };
        if (functionName.includes('Prompt')) return '';
        if (functionName.includes('Flag')) return undefined;
        return undefined;
      
      case OperationType.TELEMETRY:
        // Telemetry always returns undefined
        return undefined;
      
      default:
        // Pattern-based fallbacks for utilities
        if (functionName.startsWith('get')) return undefined;
        if (functionName.startsWith('create')) return undefined;
        if (functionName.startsWith('update')) return undefined;
        if (functionName.startsWith('delete')) return true;
        if (functionName.startsWith('has')) return false;
        if (functionName.startsWith('is')) return false;
        if (functionName.includes('flush') || functionName.includes('Flush')) {
          return Promise.resolve();
        }
        return undefined;
    }
  }

  private triggerEmergencyShutdown(context: ErrorContext): void {
    if (this.shutdownInProgress || this.hasPerformedShutdown) return;
    
    this.shutdownInProgress = true;
    
    debug(`SDK Emergency shutdown triggered by error in ${context.moduleName}.${context.functionName}`);
    
    // Perform shutdown asynchronously - don't block the current operation
    this.performEmergencyShutdown().finally(() => {
      this.shutdownInProgress = false;
      this.hasPerformedShutdown = true;
    });
  }

  private async performEmergencyShutdown(): Promise<void> {
    try {
      // Dynamic imports to avoid circular dependencies
      const initModule = await import('./init.js');
      const sessionModule = await import('./session.js');
      
      // 1. Try to flush pending events (with timeout)
      const eventQueue = initModule.getEventQueue?.();
      if (eventQueue && typeof eventQueue.forceFlush === 'function') {
        debug('Emergency shutdown: Flushing event queue...');
        await Promise.race([
          eventQueue.forceFlush(),
          new Promise(resolve => setTimeout(resolve, 5000)) // 5s timeout
        ]).catch(err => debug('Event flush failed during emergency shutdown:', err));
      }
      
      // 2. Try to end active session (with timeout)
      const sessionId = initModule.getSessionId?.();
      if (sessionId && sessionModule.endSession) {
        debug('Emergency shutdown: Ending session...');
        await Promise.race([
          sessionModule.endSession({
            isSuccessful: false,
            isSuccessfulReason: 'SDK internal error - emergency shutdown'
          }),
          new Promise(resolve => setTimeout(resolve, 3000)) // 3s timeout
        ]).catch(err => debug('Session end failed during emergency shutdown:', err));
      }
      
      // 3. Try to shutdown telemetry provider
      // Note: We don't import telemetry to avoid circular deps
      // The provider will be cleaned up on process exit anyway
      
      debug('Emergency shutdown complete');
      
    } catch (error) {
      debug('Emergency shutdown encountered error:', error);
      // Don't throw - we've done our best
    }
  }

  // Public methods for introspection (these are never wrapped)
  
  public getErrorHistory(): ReadonlyArray<ErrorContext> {
    return [...this.errorHistory];
  }

  public clearErrorHistory(): void {
    this.errorHistory = [];
  }

  public isInSilentMode(): boolean {
    return this.silentMode;
  }

  public hasShutdown(): boolean {
    return this.hasPerformedShutdown;
  }

  public resetShutdownState(): void {
    // Only for testing - allows recovery after shutdown
    this.hasPerformedShutdown = false;
    this.shutdownInProgress = false;
  }
}

/**
 * Classifies operations to determine error handling strategy
 */
class OperationClassifier {
  private readonly patterns: Array<[RegExp, OperationType]> = [];
  
  constructor() {
    this.setupClassifications();
  }
  
  private setupClassifications(): void {
    // Order matters - first match wins
    
    // Initialization operations
    this.addPattern(/^init$/i, OperationType.INITIALIZATION);
    this.addPattern(/^buildTelemetry/i, OperationType.INITIALIZATION);
    
    // Event operations
    this.addPattern(/^createEvent/i, OperationType.EVENT_CREATION);
    this.addPattern(/^create.*Event/i, OperationType.EVENT_CREATION);
    this.addPattern(/^queueEvent/i, OperationType.EVENT_CREATION);
    this.addPattern(/Event$/i, OperationType.EVENT_CREATION);
    
    // Session operations  
    this.addPattern(/^endSession/i, OperationType.SESSION_OPERATION);
    this.addPattern(/^updateSession/i, OperationType.SESSION_OPERATION);
    this.addPattern(/Session$/i, OperationType.SESSION_OPERATION);
    
    // Data fetching
    this.addPattern(/^getDataset/i, OperationType.DATA_FETCH);
    this.addPattern(/^getPrompt/i, OperationType.DATA_FETCH);
    this.addPattern(/^getFeatureFlag/i, OperationType.DATA_FETCH);
    this.addPattern(/^get.*Flag$/i, OperationType.DATA_FETCH);
    this.addPattern(/^getRawPrompt/i, OperationType.DATA_FETCH);
    
    // Telemetry operations
    this.addPattern(/telemetry/i, OperationType.TELEMETRY);
    this.addPattern(/^export/i, OperationType.TELEMETRY);
    this.addPattern(/^trace/i, OperationType.TELEMETRY);
    this.addPattern(/span/i, OperationType.TELEMETRY);
    this.addPattern(/^instrument/i, OperationType.TELEMETRY);
    this.addPattern(/^getLucidicTracer/i, OperationType.TELEMETRY);
    this.addPattern(/^aiTelemetry/i, OperationType.TELEMETRY);
    
    // Everything else is utility
  }
  
  private addPattern(pattern: RegExp, type: OperationType): void {
    this.patterns.push([pattern, type]);
  }
  
  classify(moduleName: string, functionName: string): OperationType {
    const fullName = `${moduleName}.${functionName}`;
    
    // Check patterns in order
    for (const [pattern, type] of this.patterns) {
      if (pattern.test(functionName) || pattern.test(fullName)) {
        return type;
      }
    }
    
    // Default to utility
    return OperationType.UTILITY;
  }
}

// Global singleton instance
let globalBoundary: SdkErrorBoundary | null = null;

/**
 * Get or create the global error boundary
 * This is created once at module load time based on environment variable
 */
function getGlobalBoundary(): SdkErrorBoundary {
  if (!globalBoundary) {
    globalBoundary = new SdkErrorBoundary();
  }
  return globalBoundary;
}

/**
 * Wrap an SDK module with error boundary protection
 * If LUCIDIC_SILENT_MODE=false, returns the original module unchanged
 */
export function wrapSdkModule<T extends object>(
  module: T,
  moduleName: string
): T {
  const boundary = getGlobalBoundary();
  return boundary.wrapModule(module, moduleName);
}

/**
 * Check if SDK is in silent mode
 */
export function isInSilentMode(): boolean {
  const boundary = getGlobalBoundary();
  return boundary.isInSilentMode();
}

/**
 * Get error history for debugging
 * Only available when LUCIDIC_SILENT_MODE=true
 */
export function getErrorHistory(): ReadonlyArray<ErrorContext> {
  const boundary = getGlobalBoundary();
  return boundary.getErrorHistory();
}

/**
 * Clear error history
 */
export function clearErrorHistory(): void {
  const boundary = getGlobalBoundary();
  boundary.clearErrorHistory();
}

/**
 * Check if emergency shutdown has been performed
 */
export function hasPerformedShutdown(): boolean {
  const boundary = getGlobalBoundary();
  return boundary.hasShutdown();
}

// ErrorContext is already exported above as an interface