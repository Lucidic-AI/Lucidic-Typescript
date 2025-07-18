import { AsyncLocalStorage } from 'async_hooks';
import { logger } from '../../utils/logger';
import { DEBUG } from '../../constants';

// Thread-local storage for images
const imageStorage = new AsyncLocalStorage<Map<string, string>>();

/**
 * Store an image in thread-local storage
 */
export function storeImage(imageData: string): void {
  const store = imageStorage.getStore();
  if (!store) {
    logger.warn('No async context available for image storage');
    return;
  }

  // Generate a unique key for this image
  const imageKey = `image_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  store.set(imageKey, imageData);
  
  if (DEBUG) {
    logger.debug(`Stored image with key: ${imageKey}`);
  }
}

/**
 * Get all stored images from thread-local storage
 */
export function getStoredImages(): string[] {
  const store = imageStorage.getStore();
  if (!store) {
    return [];
  }

  const images = Array.from(store.values());
  if (DEBUG) {
    logger.debug(`Retrieved ${images.length} stored images`);
  }
  return images;
}

/**
 * Clear all stored images
 */
export function clearStoredImages(): void {
  const store = imageStorage.getStore();
  if (store) {
    store.clear();
    if (DEBUG) {
      logger.debug('Cleared stored images');
    }
  }
}

/**
 * Get image by placeholder key
 */
export function getImageByPlaceholder(placeholder: string): string | undefined {
  const store = imageStorage.getStore();
  if (!store) {
    return undefined;
  }
  
  return store.get(placeholder);
}

/**
 * Run a function with image storage context
 */
export function runWithImageStorage<T>(fn: () => T): T {
  return imageStorage.run(new Map(), fn);
}

/**
 * Get the current image storage context
 */
export function getImageStorage(): Map<string, string> | undefined {
  return imageStorage.getStore();
}