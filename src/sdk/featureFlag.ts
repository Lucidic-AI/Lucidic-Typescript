import { getOrCreateHttp, getAgentIdSafe } from './init';
import { info, error as logError } from '../util/logger';
import dotenv from 'dotenv';

// Custom error class
export class FeatureFlagError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeatureFlagError';
  }
}

// Cache implementation
class FeatureFlagCache {
  private cache: Map<string, { value: any; expiry: number }> = new Map();
  private defaultTTL = 300; // 5 minutes in seconds

  get(key: string): any | undefined {
    const cached = this.cache.get(key);
    if (cached) {
      if (Date.now() < cached.expiry) {
        return cached.value;
      } else {
        this.cache.delete(key);
      }
    }
    return undefined;
  }

  set(key: string, value: any, ttl?: number): void {
    const ttlSeconds = ttl !== undefined ? ttl : this.defaultTTL;
    if (ttlSeconds > 0) {
      this.cache.set(key, {
        value,
        expiry: Date.now() + ttlSeconds * 1000
      });
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

const flagCache = new FeatureFlagCache();

// Function overloads
export async function getFeatureFlag(
  flagName: string,
  defaultValue?: any,
  options?: {
    returnMissing?: false;
    cacheTTL?: number;
    apiKey?: string;
    agentId?: string;
  }
): Promise<any>;

export async function getFeatureFlag(
  flagName: string,
  defaultValue?: any,
  options?: {
    returnMissing: true;
    cacheTTL?: number;
    apiKey?: string;
    agentId?: string;
  }
): Promise<[any, string[]]>;

export async function getFeatureFlag(
  flagNames: string[],
  defaults?: Record<string, any>,
  options?: {
    returnMissing?: false;
    cacheTTL?: number;
    apiKey?: string;
    agentId?: string;
  }
): Promise<Record<string, any>>;

export async function getFeatureFlag(
  flagNames: string[],
  defaults?: Record<string, any>,
  options?: {
    returnMissing: true;
    cacheTTL?: number;
    apiKey?: string;
    agentId?: string;
  }
): Promise<[Record<string, any>, string[]]>;

// Implementation
export async function getFeatureFlag(
  flagNameOrNames: string | string[],
  defaultOrDefaults?: any | Record<string, any>,
  options?: {
    returnMissing?: boolean;
    cacheTTL?: number;
    apiKey?: string;
    agentId?: string;
  }
): Promise<any | [any, string[]] | Record<string, any> | [Record<string, any>, string[]]> {
  dotenv.config();
  
  const isSingle = typeof flagNameOrNames === 'string';
  const flagNames = isSingle ? [flagNameOrNames] : flagNameOrNames;
  const defaults = isSingle 
    ? (defaultOrDefaults !== undefined ? { [flagNameOrNames]: defaultOrDefaults } : {})
    : (defaultOrDefaults || {});
  const cacheTTL = options?.cacheTTL !== undefined ? options.cacheTTL : 300;
  const returnMissing = options?.returnMissing || false;
  
  // Track missing flags
  const missingFlags: string[] = [];
  
  // Check cache first
  const uncachedFlags: string[] = [];
  const cachedResults: Record<string, any> = {};
  
  if (cacheTTL !== 0) {
    for (const name of flagNames) {
      const cacheKey = `${options?.agentId}:${name}`;
      const cachedValue = flagCache.get(cacheKey);
      if (cachedValue !== undefined) {
        cachedResults[name] = cachedValue;
      } else {
        uncachedFlags.push(name);
      }
    }
  } else {
    uncachedFlags.push(...flagNames);
  }
  
  // Fetch uncached flags
  if (uncachedFlags.length > 0) {
    const apiKey = options?.apiKey ?? process.env.LUCIDIC_API_KEY;
    const agentId = options?.agentId ?? getAgentIdSafe() ?? process.env.LUCIDIC_AGENT_ID;
    
    if (!apiKey) {
      throw new Error('LUCIDIC_API_KEY not provided. Set the environment variable or pass apiKey parameter.');
    }
    if (!agentId) {
      throw new Error('LUCIDIC_AGENT_ID not provided. Set the environment variable or pass agentId parameter.');
    }
    
    const http = getOrCreateHttp(apiKey, agentId);
    
    try {
      const response = await http.post('getfeatureflags', {
        flag_names: uncachedFlags
      });
      
      // Process response and cache
      for (const name of uncachedFlags) {
        if (response.flags[name]) {
          if (response.flags[name].found) {
            const value = response.flags[name].value;
            cachedResults[name] = value;
            
            // Cache the value
            if (cacheTTL !== 0) {
              const cacheKey = `${agentId}:${name}`;
              flagCache.set(cacheKey, value, cacheTTL > 0 ? cacheTTL : undefined);
            }
          } else {
            // Flag not found on server
            missingFlags.push(name);
            info(`Feature flag '${name}' not found on server`);
          }
        }
      }
    } catch (err) {
      logError('Failed to fetch feature flags:', err);
      
      // Check if we have defaults for missing flags
      for (const name of uncachedFlags) {
        if (!(name in cachedResults)) {
          if (name in defaults) {
            cachedResults[name] = defaults[name];
          } else if (isSingle && !returnMissing) {
            // Single flag without default and not returning missing - throw error
            throw new FeatureFlagError(`Failed to fetch feature flag '${name}': ${err}`);
          }
        }
      }
    }
  }
  
  // Build final result
  const result: Record<string, any> = {};
  for (const name of flagNames) {
    if (name in cachedResults) {
      result[name] = cachedResults[name];
    } else if (name in defaults) {
      result[name] = defaults[name];
    } else {
      missingFlags.push(name);
      if (isSingle && !returnMissing) {
        throw new FeatureFlagError(`Feature flag '${name}' not found and no default provided`);
      } else {
        result[name] = null;
      }
    }
  }
  
  // Return based on input type and returnMissing flag
  if (returnMissing) {
    return isSingle ? [result[flagNameOrNames as string], missingFlags] : [result, missingFlags];
  } else {
    return isSingle ? result[flagNameOrNames as string] : result;
  }
}

// Typed convenience functions
export async function getBoolFlag(
  flagName: string,
  defaultValue?: boolean,
  options?: { cacheTTL?: number; apiKey?: string; agentId?: string }
): Promise<boolean> {
  const value = await getFeatureFlag(flagName, defaultValue, options);
  if (typeof value !== 'boolean') {
    if (defaultValue !== undefined) {
      info(`Feature flag '${flagName}' is not a boolean, using default`);
      return defaultValue;
    }
    throw new TypeError(`Feature flag '${flagName}' expected boolean, got ${typeof value}`);
  }
  return value;
}

export async function getIntFlag(
  flagName: string,
  defaultValue?: number,
  options?: { cacheTTL?: number; apiKey?: string; agentId?: string }
): Promise<number> {
  const value = await getFeatureFlag(flagName, defaultValue, options);
  if (!Number.isInteger(value)) {
    if (defaultValue !== undefined) {
      info(`Feature flag '${flagName}' is not an integer, using default`);
      return defaultValue;
    }
    throw new TypeError(`Feature flag '${flagName}' expected integer, got ${typeof value}`);
  }
  return value;
}

export async function getFloatFlag(
  flagName: string,
  defaultValue?: number,
  options?: { cacheTTL?: number; apiKey?: string; agentId?: string }
): Promise<number> {
  const value = await getFeatureFlag(flagName, defaultValue, options);
  if (typeof value !== 'number') {
    if (defaultValue !== undefined) {
      info(`Feature flag '${flagName}' is not a number, using default`);
      return defaultValue;
    }
    throw new TypeError(`Feature flag '${flagName}' expected number, got ${typeof value}`);
  }
  return value;
}

export async function getStringFlag(
  flagName: string,
  defaultValue?: string,
  options?: { cacheTTL?: number; apiKey?: string; agentId?: string }
): Promise<string> {
  const value = await getFeatureFlag(flagName, defaultValue, options);
  if (typeof value !== 'string') {
    if (defaultValue !== undefined) {
      info(`Feature flag '${flagName}' is not a string, using default`);
      return defaultValue;
    }
    throw new TypeError(`Feature flag '${flagName}' expected string, got ${typeof value}`);
  }
  return value;
}

export async function getJsonFlag<T = any>(
  flagName: string,
  defaultValue?: T,
  options?: { cacheTTL?: number; apiKey?: string; agentId?: string }
): Promise<T> {
  return getFeatureFlag(flagName, defaultValue, options);
}

export function clearFeatureFlagCache(): void {
  flagCache.clear();
  info('Feature flag cache cleared');
}