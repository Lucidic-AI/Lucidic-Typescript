import { debug, error as logError, warn } from '../util/logger';

/**
 * context information about where an error occurred
 */
export interface ErrorContext {
    functionName: string;
    moduleName: string;
    args: any[];
    error: unknown;
    timestamp: Date;
}

/**
 * classification of SDK operations for handling strategy
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
 * sdk error boundary - prevents SDK errors from crashing user applications
 * 
 * controlled by environment variable:
 * - LUCIDIC_SILENT_MODE="true" (default): swallow errors with context-aware cleanup
 * - LUCIDIC_SILENT_MODE="false": let errors propagate normally
 * 
 * key features:
 * - stateless operation: each SDK call gets a fresh chance to succeed
 * - context-aware cleanup: only cleans up what needs cleaning (sessions/events)
 * - full recovery: no persistent "poison pill" state
 */
class SdkErrorBoundary {
    private readonly silentMode: boolean;
    private errorHistory: ErrorContext[] = [];
    private emergencyEndedSessions = new Set<string>(); // track cleaned-up sessions
    private wrappedModules = new WeakMap<object, object>();
    private functionCache = new WeakMap<Function, Function>();
    private operationClassifier = new OperationClassifier();
    
    constructor() {
        // read configuration from environment at construction time
        const envValue = process.env.LUCIDIC_SILENT_MODE?.toLowerCase();
        
        // default to true (silent mode ON)
        this.silentMode = envValue !== 'false';
        
        if (this.silentMode) {
            debug('SDK error boundary enabled - errors will be handled with context-aware cleanup');
        } else {
            debug('SDK error boundary disabled - errors will propagate to user code');
        }
    }

    /**
     * wraps a module with error boundary protection
     */
    wrapModule<T extends object>(module: T, moduleName: string): T {
        // fast path: if not in silent mode, return original module
        if (!this.silentMode) {
            return module;
        }

        // check cache
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
                // skip symbols, private properties, and constructors
                if (typeof prop === 'symbol' || 
                    (typeof prop === 'string' && prop.startsWith('_')) ||
                    prop === 'constructor') {
                    return Reflect.get(target, prop, receiver);
                }

                const value = Reflect.get(target, prop, receiver);

                // wrap functions
                if (typeof value === 'function' && typeof prop === 'string') {
                    return self.wrapFunction(
                        value,
                        prop,
                        moduleName,
                        target
                    );
                }

                // recursively wrap nested modules
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
                // if setting a function, wrap it
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
        // check cache first
        const cached = this.functionCache.get(fn);
        if (cached) return cached;

        // skip certain functions that should never be wrapped
        if (this.shouldSkipWrapping(fnName, moduleName)) {
            return fn;
        }

        const self = this;
        const operationType = this.operationClassifier.classify(moduleName, fnName);
        
        // detect if function is async
        const isAsync = fn.constructor.name === 'AsyncFunction' ||
                        fnName.toLowerCase().includes('async');

        // create named wrapper for better stack traces
        const wrapper = {
            [fnName]: function(this: any, ...args: any[]) {
                // execute with error handling
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

                        // handle promises/async functions
                        if (result && typeof result.then === 'function') {
                            return await result;
                        }
                        return result;

                    } catch (error) {
                        context.error = error;
                        
                        // log the error
                        self.logError(context, operationType);
                        
                        // collect in history
                        self.collectError(context);
                        
                        // perform context-aware cleanup (fire-and-forget)
                        self.performContextualCleanup(context).catch(err => 
                            debug('Contextual cleanup failed:', err)
                        );
                        
                        // return fallback value
                        return self.getFallbackValue(fnName, operationType);
                    }
                };

                // execute
                const result = execute();
                
                // for sync functions, we need to handle the Promise
                if (!isAsync && result instanceof Promise) {
                    // in silent mode, we make everything potentially async
                    // this is a tradeoff for simplicity and consistency
                    return result;
                }
                
                return result;
            }
        }[fnName];

        // preserve function properties
        Object.setPrototypeOf(wrapper, Object.getPrototypeOf(fn));
        Object.defineProperties(wrapper, {
            length: { value: fn.length },
            name: { value: fnName }
        });

        // cache the wrapper
        this.functionCache.set(fn, wrapper);
        
        return wrapper;
    }

    private shouldSkipWrapping(fnName: string, moduleName: string): boolean {
        // these are frequently called getters that rarely fail
        // skipping them improves performance
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
            'getActiveSessionFromAls',
            // decorator functions need special handling - they return functions
            'event'
        ];
        
        return skipList.includes(fnName);
    }

    private sanitizeArgs(args: any[]): any[] {
        // limit args to prevent memory issues and sensitive data exposure
        return args.slice(0, 3).map(arg => {
            if (arg === null || arg === undefined) return arg;
            if (typeof arg === 'string') {
                // truncate long strings and mask potential secrets
                if (arg.length > 100) return arg.substring(0, 100) + '...';
                if (arg.toLowerCase().includes('key') || 
                    arg.toLowerCase().includes('token') ||
                    arg.toLowerCase().includes('secret') ||
                    arg.toLowerCase().includes('password')) {
                    return '<REDACTED>';
                }
                return arg;
            }
            if (typeof arg === 'object') {
                // just return type info for objects
                return `<${arg.constructor?.name || 'Object'}>`;
            }
            return arg;
        });
    }

    private logError(context: ErrorContext, operationType: OperationType): void {
        // extract error details without stack trace
        const error = context.error;
        const errorType = error?.constructor?.name || 'Error';
        const errorMessage = (error as any)?.message || String(error);
        
        // format concise message with error type and message
        const message = `SDK Error in ${context.moduleName}.${context.functionName} (${operationType}): ${errorType} - ${errorMessage}`;
        
        // only log if debug/verbose mode is enabled (controlled by logger module)
        if (operationType === OperationType.TELEMETRY || 
            operationType === OperationType.UTILITY) {
            debug(message);  // no error object passed, just the formatted message
        } else {
            warn(message);   // no error object passed, just the formatted message
        }
    }

    private collectError(context: ErrorContext): void {
        this.errorHistory.push({ ...context });
        
        // limit history size to prevent memory leaks
        if (this.errorHistory.length > 100) {
            this.errorHistory = this.errorHistory.slice(-50);
        }
    }

    private getFallbackValue(functionName: string, operationType: OperationType): any {
        // return appropriate fallback based on operation type
        switch (operationType) {
            case OperationType.INITIALIZATION:
                // for init, return a fake session ID so app can continue
                if (functionName === 'init') {
                    return `fallback-session-${Date.now()}`;
                }
                return undefined;
            
            case OperationType.EVENT_CREATION:
                // events return undefined (event not created)
                return undefined;
            
            case OperationType.SESSION_OPERATION:
                // session operations return void/undefined
                return undefined;
            
            case OperationType.DATA_FETCH:
                // data fetches return appropriate empty data
                if (functionName === 'getDataset' || functionName.includes('Dataset')) {
                    return { items: [], dataset_id: '', name: '', num_items: 0 };
                }
                if (functionName === 'getDatasetItems') {
                    return [];
                }
                if (functionName.includes('Prompt') || functionName === 'getPrompt' || functionName === 'getRawPrompt') {
                    return '';
                }
                if (functionName.includes('Flag')) {
                    // for feature flags, return undefined (will trigger defaults)
                    return undefined;
                }
                if (functionName === 'createExperiment') {
                    // return a fallback experiment ID
                    return `fallback-experiment-${Date.now()}`;
                }
                return undefined;
            
            case OperationType.TELEMETRY:
                // telemetry operations typically return void
                return undefined;
            
            case OperationType.UTILITY:
                // utility functions - return sensible defaults
                if (functionName.startsWith('get')) return undefined;
                if (functionName.startsWith('clear')) return undefined;
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

    /**
     * perform context-aware cleanup based on the type of operation that failed
     * only cleans up sessions/events for session-related operations
     */
    private async performContextualCleanup(context: ErrorContext): Promise<void> {
        const operationType = this.operationClassifier.classify(
            context.moduleName, 
            context.functionName
        );
        
        // only cleanup for session-related operations
        const needsSessionCleanup = 
            operationType === OperationType.INITIALIZATION ||
            operationType === OperationType.SESSION_OPERATION ||
            operationType === OperationType.EVENT_CREATION;
            
        if (!needsSessionCleanup) {
            debug(`No cleanup needed for ${operationType} operation`);
            return;
        }
        
        try {
            // dynamic imports to avoid circular dependencies
            const initModule = await import('./init.js');
            const sessionModule = await import('./session.js');
            
            // get current session ID
            const sessionId = initModule.getSessionId?.();
            
            if (!sessionId) {
                debug('No active session to cleanup');
                return;
            }
            
            if (this.emergencyEndedSessions.has(sessionId)) {
                debug(`Session ${sessionId} already cleaned up`);
                return;
            }
            
            // mark session as ended to prevent double-cleanup
            this.emergencyEndedSessions.add(sessionId);
            debug(`Emergency cleanup for session ${sessionId} due to error in ${context.functionName}`);
            
            // 1. try to flush pending events (with timeout)
            const eventQueue = initModule.getEventQueue?.();
            if (eventQueue && typeof eventQueue.forceFlush === 'function') {
                debug('Emergency cleanup: Flushing event queue...');
                await Promise.race([
                    eventQueue.forceFlush(),
                    new Promise(resolve => setTimeout(resolve, 5000)) // 5s timeout
                ]).catch(err => debug('Event flush failed during cleanup:', err));
            }
            
            // 2. try to end session (with timeout)
            if (sessionModule.endSession) {
                debug('Emergency cleanup: Ending session...');
                await Promise.race([
                    sessionModule.endSession({
                        isSuccessful: false,
                        isSuccessfulReason: `SDK error in ${context.moduleName}.${context.functionName}`
                    }),
                    new Promise(resolve => setTimeout(resolve, 5000)) // 5s timeout
                ]).catch(err => debug('Session end failed during cleanup:', err));
            }
            
            debug('Emergency cleanup completed');
        } catch (cleanupError) {
            debug('Emergency cleanup encountered error:', cleanupError);
        }
    }

    /**
     * check if a session has been emergency-ended due to an error
     */
    isSessionEmergencyEnded(sessionId: string): boolean {
        return this.emergencyEndedSessions.has(sessionId);
    }

    /**
     * clear the list of emergency-ended sessions (useful for testing)
     */
    clearEndedSessions(): void {
        this.emergencyEndedSessions.clear();
        debug('Cleared emergency-ended sessions list');
    }

    /**
     * get count of emergency-ended sessions (for monitoring)
     */
    getEndedSessionCount(): number {
        return this.emergencyEndedSessions.size;
    }

    /**
     * check if error boundary is in silent mode
     */
    isInSilentMode(): boolean {
        return this.silentMode;
    }

    /**
     * get error history for debugging
     */
    getErrorHistory(): ErrorContext[] {
        return [...this.errorHistory];
    }

    /**
     * clear error history
     */
    clearErrorHistory(): void {
        this.errorHistory = [];
        debug('Cleared error history');
    }
}

/**
 * classifies SDK operations to determine appropriate error handling
 */
class OperationClassifier {
    classify(moduleName: string, functionName: string): OperationType {
        // initialization operations (session-creating)
        if (functionName === 'init' || functionName === 'withLucidic') {
            return OperationType.INITIALIZATION;
        }
        
        // session management operations
        if (moduleName === 'session' || 
            functionName === 'updateSession' || 
            functionName === 'endSession') {
            return OperationType.SESSION_OPERATION;
        }
        
        // event operations (require active session)
        if (moduleName === 'event' || 
            moduleName === 'eventHelpers' ||
            functionName.toLowerCase().includes('event')) {
            return OperationType.EVENT_CREATION;
        }
        
        // decorator operations (may create events)
        if (moduleName === 'decorators') {
            return OperationType.EVENT_CREATION;
        }
        
        // standalone data operations (no session required)
        if (moduleName === 'experiment' || 
            moduleName === 'dataset' || 
            moduleName === 'featureFlag' ||
            moduleName === 'prompt') {
            return OperationType.DATA_FETCH;
        }
        
        // telemetry operations
        if (moduleName === 'telemetry' || 
            functionName.includes('telemetry') ||
            functionName.includes('Tracer')) {
            return OperationType.TELEMETRY;
        }
        
        // everything else is utility
        return OperationType.UTILITY;
    }
}

// singleton instance
const errorBoundaryInstance = new SdkErrorBoundary();

/**
 * get the singleton error boundary instance
 */
export function getErrorBoundaryInstance(): SdkErrorBoundary {
    return errorBoundaryInstance;
}

/**
 * wrap an SDK module with error boundary protection
 */
export function wrapSdkModule<T extends object>(module: T, moduleName: string): T {
    return errorBoundaryInstance.wrapModule(module, moduleName);
}

/**
 * check if SDK is in silent mode
 */
export function isInSilentMode(): boolean {
    return errorBoundaryInstance.isInSilentMode();
}

/**
 * get error history for debugging
 */
export function getErrorHistory(): ErrorContext[] {
    return errorBoundaryInstance.getErrorHistory();
}

/**
 * clear error history
 */
export function clearErrorHistory(): void {
    errorBoundaryInstance.clearErrorHistory();
}

/**
 * check if a session was emergency-ended
 */
export function isSessionEmergencyEnded(sessionId: string): boolean {
    return errorBoundaryInstance.isSessionEmergencyEnded(sessionId);
}