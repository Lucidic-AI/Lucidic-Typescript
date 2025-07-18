import { AsyncLocalStorage } from 'async_hooks';
import { logger } from '../../utils/logger';
import { DEBUG } from '../../constants';

// Thread-local storage for text content
const textStorage = new AsyncLocalStorage<Map<number, string>>();

/**
 * Store text content in thread-local storage
 */
export function storeText(index: number, text: string): void {
  const store = textStorage.getStore();
  if (!store) {
    logger.warn('No async context available for text storage');
    return;
  }

  store.set(index, text);
  if (DEBUG) {
    logger.debug(`Stored text for message index: ${index}`);
  }
}

/**
 * Get stored text by index
 */
export function getStoredText(index: number): string | undefined {
  const store = textStorage.getStore();
  if (!store) {
    return undefined;
  }

  return store.get(index);
}

/**
 * Get all stored texts
 */
export function getAllStoredTexts(): Map<number, string> {
  const store = textStorage.getStore();
  return store || new Map();
}

/**
 * Clear all stored texts
 */
export function clearStoredTexts(): void {
  const store = textStorage.getStore();
  if (store) {
    store.clear();
    if (DEBUG) {
      logger.debug('Cleared stored texts');
    }
  }
}

/**
 * Run a function with text storage context
 */
export function runWithTextStorage<T>(fn: () => T): T {
  return textStorage.run(new Map(), fn);
}

/**
 * Get the current text storage context
 */
export function getTextStorage(): Map<number, string> | undefined {
  return textStorage.getStore();
}