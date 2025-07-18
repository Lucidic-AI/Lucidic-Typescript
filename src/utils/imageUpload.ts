import axios from 'axios';
import { logger } from './logger';

/**
 * Upload an image to S3 using a presigned URL
 * @param url The presigned URL
 * @param imageData The image data (base64 string or Buffer)
 * @param format The image format (currently only JPEG is supported)
 */
export async function uploadImageToS3(
  url: string, 
  imageData: string | Buffer, 
  format: 'JPEG' | 'GIF' = 'JPEG'
): Promise<void> {
  try {
    let uploadData: Buffer;
    let contentType: string;

    if (format === 'JPEG') {
      // Handle data URIs by extracting just the base64 part
      if (typeof imageData === 'string') {
        let base64Data = imageData;
        if (imageData.startsWith('data:')) {
          // Extract base64 data from data URI
          const parts = imageData.split(',');
          base64Data = parts.length > 1 ? parts[1] : imageData;
        }
        uploadData = Buffer.from(base64Data, 'base64');
      } else {
        uploadData = imageData;
      }
      contentType = 'image/jpeg';
    } else if (format === 'GIF') {
      // For GIF, assume buffer is provided
      if (typeof imageData === 'string') {
        throw new Error('GIF format requires Buffer input');
      }
      uploadData = imageData;
      contentType = 'image/gif';
    } else {
      throw new Error(`Unsupported format: ${format}`);
    }

    // Upload to S3
    const response = await axios.put(url, uploadData, {
      headers: {
        'Content-Type': contentType
      }
    });

    if (response.status !== 200) {
      throw new Error(`Upload failed with status: ${response.status}`);
    }

    logger.debug(`Successfully uploaded image to S3`);
  } catch (error) {
    logger.error('Failed to upload image to S3:', error);
    throw error;
  }
}

/**
 * Extract base64 images from various data structures
 * @param data Can be a string, dict, list, or nested structure containing image data
 * @returns Array of base64 image data URLs (data:image/...)
 */
export function extractBase64Images(data: any): string[] {
  const images: string[] = [];
  
  if (typeof data === 'string' && data.startsWith('data:image')) {
    images.push(data);
  } else if (typeof data === 'object' && data !== null) {
    if (Array.isArray(data)) {
      for (const item of data) {
        images.push(...extractBase64Images(item));
      }
    } else {
      for (const value of Object.values(data)) {
        images.push(...extractBase64Images(value));
      }
    }
  }
  
  return images;
}