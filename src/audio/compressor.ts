import { exec, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
const ffmpeg = require('fluent-ffmpeg');

// Get FFmpeg path with multiple fallbacks
function getFfmpegPath(): string {
  try {
    // Check for bundled FFmpeg first
    const bundledPath = path.join(process.resourcesPath || __dirname, 'ffmpeg');
    if (fs.existsSync(bundledPath)) {
      return bundledPath;
    }
    
    // Use system FFmpeg (most macOS systems have this available)
    return 'ffmpeg';
  } catch (error) {
    console.warn('FFmpeg path resolution failed, using system ffmpeg:', error);
    return 'ffmpeg';
  }
}

export interface CompressionStats {
  originalSize: number;
  compressedSize: number;
  compressionTime: number;
  compressionRatio: number;
  format: string;
}

export class AudioCompressor {
  
  /**
   * Compress audio file using FFmpeg for optimal size and speed
   */
  static async compressAudio(
    inputFile: string, 
    outputFormat: 'mp3' | 'm4a' | 'ogg' = 'm4a',
    quality: 'low' | 'medium' | 'high' = 'medium'
  ): Promise<{ file: string; stats: CompressionStats }> {
    const startTime = Date.now();
    const outputFile = inputFile.replace(/\.(wav|mp3|m4a|ogg)$/, `.${outputFormat}`);
    
    if (!fs.existsSync(inputFile)) {
      throw new Error(`Input file not found: ${inputFile}`);
    }
    
    const originalSize = fs.statSync(inputFile).size;
    
    return new Promise((resolve, reject) => {
      const ffmpegPath = getFfmpegPath();
      console.log(`🔧 Using FFmpeg path: ${ffmpegPath}`);
      
      try {
        // Create FFmpeg command with error handling
        const ffmpegCommand = ffmpeg(inputFile)
          .setFfmpegPath(ffmpegPath)
          .audioChannels(1)
          .audioFrequency(16000);
        
        // Set quality based on format and preference
        switch (outputFormat) {
          case 'mp3':
            const mp3Quality = quality === 'high' ? '64k' : quality === 'medium' ? '48k' : '32k';
            ffmpegCommand.audioBitrate(mp3Quality).format('mp3');
            break;
          case 'm4a':
            const m4aQuality = quality === 'high' ? '64k' : quality === 'medium' ? '48k' : '32k';
            ffmpegCommand.audioBitrate(m4aQuality).format('mp4');
            break;
          case 'ogg':
            const oggQuality = quality === 'high' ? 6 : quality === 'medium' ? 4 : 2;
            ffmpegCommand.audioQuality(oggQuality).format('ogg');
            break;
        }
        
        ffmpegCommand
          .on('end', () => {
            const compressionTime = Date.now() - startTime;
            
            if (fs.existsSync(outputFile)) {
              const compressedSize = fs.statSync(outputFile).size;
              const compressionRatio = ((1 - compressedSize / originalSize) * 100);
              
              const stats: CompressionStats = {
                originalSize,
                compressedSize,
                compressionTime,
                compressionRatio,
                format: outputFormat
              };
              
              console.log(`🗜️ FFmpeg compression: ${originalSize} → ${compressedSize} bytes (${compressionRatio.toFixed(1)}% smaller) in ${compressionTime}ms`);
              
              resolve({ file: outputFile, stats });
            } else {
              reject(new Error('Output file was not created'));
            }
          })
          .on('error', (err: Error) => {
            console.warn('FFmpeg compression failed, returning original file:', err.message);
            // Return original file instead of failing
            resolve({
              file: inputFile,
              stats: {
                originalSize,
                compressedSize: originalSize,
                compressionTime: Date.now() - startTime,
                compressionRatio: 0,
                format: 'original'
              }
            });
          })
          .save(outputFile);
          
      } catch (error) {
        console.warn('FFmpeg setup failed, returning original file:', error);
        // Return original file if FFmpeg setup fails
        resolve({
          file: inputFile,
          stats: {
            originalSize,
            compressedSize: originalSize,
            compressionTime: Date.now() - startTime,
            compressionRatio: 0,
            format: 'original'
          }
        });
      }
    });
  }
  
  /**
   * Get optimal compression settings based on audio duration and use case
   */
  static getOptimalSettings(audioDurationMs: number, contentType: 'dictation' | 'conversation' = 'dictation') {
    // For very short dictation, prioritize speed
    if (audioDurationMs < 5000) {
      return { format: 'm4a' as const, quality: 'low' as const };
    }
    
    // For medium length, balance quality and size
    if (audioDurationMs < 30000) {
      return { format: 'm4a' as const, quality: 'medium' as const };
    }
    
    // For long audio, prioritize compression
    return { format: 'mp3' as const, quality: 'medium' as const };
  }
  
  /**
   * Benchmark compression performance for different settings
   */
  static async benchmarkCompression(inputFile: string): Promise<CompressionStats[]> {
    const results: CompressionStats[] = [];
    const formats: Array<{ format: 'mp3' | 'm4a' | 'ogg', quality: 'low' | 'medium' | 'high' }> = [
      { format: 'mp3', quality: 'low' },
      { format: 'mp3', quality: 'medium' },
      { format: 'm4a', quality: 'low' },
      { format: 'm4a', quality: 'medium' },
      { format: 'ogg', quality: 'medium' }
    ];
    
    console.log('🧪 Starting compression benchmark...');
    
    for (const { format, quality } of formats) {
      try {
        const result = await this.compressAudio(inputFile, format, quality);
        results.push(result.stats);
        
        // Clean up test file
        try {
          fs.unlinkSync(result.file);
        } catch (e) {
          // Ignore cleanup errors
        }
      } catch (error) {
        console.warn(`Benchmark failed for ${format}/${quality}:`, error);
      }
    }
    
    // Sort by best compression ratio
    results.sort((a, b) => b.compressionRatio - a.compressionRatio);
    
    console.log('📊 Benchmark Results (sorted by compression ratio):');
    results.forEach((stat, i) => {
      console.log(`${i + 1}. ${stat.format}: ${stat.compressionRatio.toFixed(1)}% smaller in ${stat.compressionTime}ms`);
    });
    
    return results;
  }
}
