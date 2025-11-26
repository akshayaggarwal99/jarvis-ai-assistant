import * as fs from 'fs';
import * as path from 'path';
import { Jimp, JimpMime } from 'jimp';

export interface ImageCompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 1-100, only applies to JPEG
  format?: 'jpeg' | 'png' | 'webp';
  enableCompression?: boolean;
}

export interface CompressedImageResult {
  mimeType: string;
  data: string; // base64 encoded
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

/**
 * Get image MIME type from file extension
 */
function getImageMimeType(imagePath: string): string {
  const ext = path.extname(imagePath).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.bmp':
      return 'image/bmp';
    default:
      return 'image/jpeg'; // Default fallback
  }
}

/**
 * Compresses an image using Jimp library with configurable options
 * Optimized for AI API usage with good balance between quality and file size
 */
export async function compressImage(
  imagePath: string,
  options: ImageCompressionOptions = {}
): Promise<CompressedImageResult | null> {
  try {
    // Default options optimized for speed (matching previous app)
    const {
      maxWidth = 1024,
      maxHeight = 768,
      quality = 60,
      format = 'jpeg',
      enableCompression = true
    } = options;

    // Read original file to get size
    const originalBuffer = await fs.promises.readFile(imagePath);
    const originalSize = originalBuffer.length;

    console.log(`[ImageCompression] Processing image: ${imagePath}`);
    console.log(`[ImageCompression] Original size: ${(originalSize / 1024).toFixed(2)} KB`);

    let processedBuffer: Buffer;
    let outputMimeType: string;

    if (!enableCompression) {
      // Return original image as base64 without compression
      processedBuffer = originalBuffer;
      outputMimeType = getImageMimeType(imagePath);
    } else {
      // Load image with Jimp
      const image = await Jimp.read(imagePath);
      
      // Get original dimensions
      const originalWidth = image.width;
      const originalHeight = image.height;
      
      console.log(`[ImageCompression] Original dimensions: ${originalWidth}x${originalHeight}`);

      // Calculate new dimensions while maintaining aspect ratio
      let newWidth = originalWidth;
      let newHeight = originalHeight;

      if (originalWidth > maxWidth || originalHeight > maxHeight) {
        const widthRatio = maxWidth / originalWidth;
        const heightRatio = maxHeight / originalHeight;
        const ratio = Math.min(widthRatio, heightRatio);

        newWidth = Math.round(originalWidth * ratio);
        newHeight = Math.round(originalHeight * ratio);

        console.log(`[ImageCompression] Resizing to: ${newWidth}x${newHeight}`);
        image.resize({ w: newWidth, h: newHeight });
      }

      // Apply compression based on format
      if (format === 'jpeg') {
        processedBuffer = await image.getBuffer(JimpMime.jpeg, { quality });
        outputMimeType = 'image/jpeg';
      } else if (format === 'png') {
        // PNG doesn't have quality setting in Jimp
        processedBuffer = await image.getBuffer(JimpMime.png);
        outputMimeType = 'image/png';
      } else if (format === 'webp') {
        // Jimp doesn't support WebP, fallback to JPEG
        console.log('[ImageCompression] WebP not supported by Jimp, using JPEG instead');
        processedBuffer = await image.getBuffer(JimpMime.jpeg, { quality });
        outputMimeType = 'image/jpeg';
      } else {
        // Default to JPEG
        processedBuffer = await image.getBuffer(JimpMime.jpeg, { quality });
        outputMimeType = 'image/jpeg';
      }
    }

    const compressedSize = processedBuffer.length;
    const compressionRatio = originalSize > 0 ? ((originalSize - compressedSize) / originalSize) * 100 : 0;

    console.log(`[ImageCompression] Compressed size: ${(compressedSize / 1024).toFixed(2)} KB`);
    console.log(`[ImageCompression] Compression ratio: ${compressionRatio.toFixed(2)}%`);

    // Convert to base64
    const base64Data = processedBuffer.toString('base64');

    return {
      mimeType: outputMimeType,
      data: base64Data,
      originalSize,
      compressedSize,
      compressionRatio: parseFloat(compressionRatio.toFixed(2))
    };

  } catch (error: any) {
    console.error('[ImageCompression] Error compressing image:', error);
    return null;
  }
}

/**
 * Get optimal compression settings for speed-optimized vision processing
 */
export function getOptimalCompressionSettings(originalSize: number): ImageCompressionOptions {
  // Ultra-aggressive compression for maximum speed (matching previous app)
  const SMALL_IMAGE = 300 * 1024; // 300KB
  const MEDIUM_IMAGE = 800 * 1024; // 800KB

  if (originalSize <= SMALL_IMAGE) {
    // Small images - skip compression for speed
    return {
      enableCompression: false
    };
  } else if (originalSize <= MEDIUM_IMAGE) {
    // Medium images - aggressive compression like previous app
    return {
      maxWidth: 1024,
      maxHeight: 768,
      quality: 70,
      format: 'jpeg',
      enableCompression: true
    };
  } else {
    // Large images - match previous app's aggressive settings
    return {
      maxWidth: 1024,
      maxHeight: 768,
      quality: 60,
      format: 'jpeg',
      enableCompression: true
    };
  }
}
