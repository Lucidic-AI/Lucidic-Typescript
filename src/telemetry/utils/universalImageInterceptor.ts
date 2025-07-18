import { logger } from '../../utils/logger';
import { storeImage } from './imageStorage';
import { DEBUG } from '../../constants';

/**
 * Intercept and store base64 images from multimodal inputs
 * This handles both OpenAI and Anthropic image formats
 */
export function interceptImages(content: any): any {
  if (!content) return content;

  // Handle array of content items (OpenAI format)
  if (Array.isArray(content)) {
    return content.map(item => {
      if (item?.type === 'image_url' && item.image_url?.url) {
        const url = item.image_url.url;
        if (url.startsWith('data:image')) {
          // Store the base64 image
          storeImage(url);
          if (DEBUG) {
            logger.debug('Intercepted and stored image from content array');
          }
          
          // Return a placeholder to reduce span size
          return {
            ...item,
            image_url: {
              ...item.image_url,
              url: `lucidic_image_placeholder_${Date.now()}`
            }
          };
        }
      } else if (item?.type === 'image' && item.source?.data) {
        // Anthropic format
        const base64Data = item.source.data;
        const mediaType = item.source.media_type || 'image/jpeg';
        const dataUri = `data:${mediaType};base64,${base64Data}`;
        
        storeImage(dataUri);
        if (DEBUG) {
          logger.debug('Intercepted and stored Anthropic image');
        }
        
        // Return a placeholder
        return {
          ...item,
          source: {
            ...item.source,
            data: `lucidic_image_placeholder_${Date.now()}`
          }
        };
      }
      return item;
    });
  }

  // Handle direct content (might be a string or object)
  return content;
}

/**
 * Process messages to intercept images
 */
export function interceptMessagesImages(messages: any[]): any[] {
  if (!Array.isArray(messages)) return messages;

  return messages.map((message, index) => {
    if (message.content) {
      const processedContent = interceptImages(message.content);
      
      // Store text content if it's multimodal
      if (Array.isArray(message.content)) {
        const textContent = message.content
          .filter((item: any) => item.type === 'text')
          .map((item: any) => item.text || '')
          .join(' ');
        
        if (textContent) {
          const { storeText } = require('./textStorage');
          storeText(index, textContent);
        }
      }
      
      return {
        ...message,
        content: processedContent
      };
    }
    return message;
  });
}