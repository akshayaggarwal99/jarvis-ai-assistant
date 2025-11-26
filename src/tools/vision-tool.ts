import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { spawn } from "child_process";
import { readFileSync, unlinkSync } from "fs";
import { Logger } from "../core/logger";
import { compressImage, getOptimalCompressionSettings } from "../utils/image-compression";
import { SecureAPIService } from "../services/secure-api-service";

const visionToolSchema = z.object({
  action: z.enum(["capture", "analyze"]).describe("Use 'capture' to take a screenshot of the user's screen and analyze it"),
  query: z.string().nullable().optional().describe("What specific thing to analyze about the screen content (e.g., 'what do you see', 'analyze this code', 'what's displayed')")
});

export const visionTool = tool(
  async ({ action, query }) => {
    try {
      if (action === "capture") {
        return await captureScreen(query || undefined);
      } else {
        return "Analysis functionality will be implemented when image is provided";
      }
    } catch (error) {
      Logger.error('❌ [Vision] Tool failed:', error);
      return `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  },
  {
    name: "vision_tool",
    description: "Capture and analyze the user's screen content. Use this tool when the user asks about what they see on their screen, wants screen analysis, or mentions anything about their current display. Always use action='capture' to take a screenshot and analyze it with the user's query.",
    schema: visionToolSchema,
  }
);

async function captureScreen(analysisQuery?: string): Promise<string> {
  const startTime = Date.now();
  const timestamp = Date.now();
  const screenshotPath = `/tmp/jarvis_screenshot_${timestamp}.png`;
  
  return new Promise((resolve, reject) => {
    Logger.debug('📸 [Vision] Capturing screen...');
    
    // Use macOS screencapture command
    const captureProcess = spawn('screencapture', ['-x', screenshotPath]);
    
    captureProcess.on('close', async (code) => {
      if (code === 0) {
        try {
          const captureTime = Date.now() - startTime;
          Logger.debug(`📸 [Vision] Screen capture took ${captureTime}ms`);
          
          // Get file size for optimal compression
          const stats = await import('fs').then(fs => fs.promises.stat(screenshotPath));
          const fileSize = stats.size;
          
          Logger.debug(`📸 [Vision] Screen captured (${Math.round(fileSize / 1024)}KB), compressing...`);
          
          // Get optimal compression settings for speed
          const compressionStartTime = Date.now();
          const compressionOptions = getOptimalCompressionSettings(fileSize);
          
          // Compress the image
          const compressed = await compressImage(screenshotPath, compressionOptions);
          const compressionTime = Date.now() - compressionStartTime;
          Logger.debug(`📸 [Vision] Compression took ${compressionTime}ms`);
          
          if (!compressed) {
            // Fallback to original if compression fails
            const imageBuffer = readFileSync(screenshotPath);
            const base64Image = imageBuffer.toString('base64');
            Logger.warning('⚠️ [Vision] Compression failed, using original image');
            
            if (analysisQuery) {
              const analysisStartTime = Date.now();
              const analysis = await analyzeImage(base64Image, analysisQuery, "image/png");
              const analysisTime = Date.now() - analysisStartTime;
              const totalTime = Date.now() - startTime;
              Logger.debug(`📸 [Vision] Analysis took ${analysisTime}ms, total vision time: ${totalTime}ms`);
              cleanupFile(screenshotPath);
              resolve(analysis);
            } else {
              // For simple screenshot requests, copy to clipboard using osascript
              const { spawn: spawnClipboard } = require('child_process');
              const copyToClipboard = spawnClipboard('osascript', [
                '-e', 
                `set the clipboard to (read (POSIX file "${screenshotPath}") as JPEG picture)`
              ]);
              
              copyToClipboard.on('close', (code) => {
                cleanupFile(screenshotPath);
                if (code === 0) {
                  resolve(`📋 Screenshot captured and copied to clipboard! You can paste it anywhere with Cmd+V. Size: ${Math.round(imageBuffer.length / 1024)}KB`);
                } else {
                  resolve(`📸 Screenshot captured successfully but clipboard copy failed. Image size: ${Math.round(imageBuffer.length / 1024)}KB`);
                }
              });
              
              copyToClipboard.on('error', () => {
                // Fallback if clipboard copy fails
                cleanupFile(screenshotPath);
                resolve(`📸 Screenshot captured successfully. Image size: ${Math.round(imageBuffer.length / 1024)}KB`);
              });
            }
            return;
          }
          
          Logger.debug(`📸 [Vision] Image compressed: ${Math.round(compressed.originalSize / 1024)}KB → ${Math.round(compressed.compressedSize / 1024)}KB (${compressed.compressionRatio}% reduction)`);
          
          // Analyze the compressed image if query provided
          if (analysisQuery) {
            const analysisStartTime = Date.now();
            const analysis = await analyzeImage(compressed.data, analysisQuery, compressed.mimeType);
            const analysisTime = Date.now() - analysisStartTime;
            const totalTime = Date.now() - startTime;
            Logger.debug(`📸 [Vision] Analysis took ${analysisTime}ms, total vision time: ${totalTime}ms`);
            cleanupFile(screenshotPath);
            resolve(analysis);
          } else {
            // For simple screenshot requests, copy to clipboard using osascript
            const { spawn: spawnClipboard } = require('child_process');
            const copyToClipboard = spawnClipboard('osascript', [
              '-e', 
              `set the clipboard to (read (POSIX file "${screenshotPath}") as JPEG picture)`
            ]);
            
            copyToClipboard.on('close', (code) => {
              cleanupFile(screenshotPath);
              if (code === 0) {
                resolve(`📋 Screenshot captured and copied to clipboard! You can paste it anywhere with Cmd+V. Size: ${Math.round(compressed.originalSize / 1024)}KB → ${Math.round(compressed.compressedSize / 1024)}KB compressed.`);
              } else {
                resolve(`📸 Screenshot captured successfully but clipboard copy failed. Original: ${Math.round(compressed.originalSize / 1024)}KB, Compressed: ${Math.round(compressed.compressedSize / 1024)}KB`);
              }
            });
            
            copyToClipboard.on('error', () => {
              // Fallback if clipboard copy fails
              cleanupFile(screenshotPath);
              resolve(`📸 Screenshot captured successfully. Original: ${Math.round(compressed.originalSize / 1024)}KB, Compressed: ${Math.round(compressed.compressedSize / 1024)}KB`);
            });
          }
        } catch (error) {
          Logger.error('❌ [Vision] Failed to process screenshot:', error);
          cleanupFile(screenshotPath);
          reject(new Error(`Failed to process screenshot: ${error}`));
        }
      } else {
        Logger.error(`❌ [Vision] Screenshot failed with code: ${code}`);
        reject(new Error(`Screenshot capture failed with code: ${code}`));
      }
    });
    
    captureProcess.on('error', (error) => {
      Logger.error('❌ [Vision] Screenshot process error:', error);
      reject(new Error(`Screenshot process error: ${error.message}`));
    });
  });
}

function cleanupFile(filePath: string): void {
  try {
    unlinkSync(filePath);
  } catch (cleanupError) {
    Logger.warning('🧹 [Vision] Failed to clean up screenshot file:', cleanupError);
  }
}

// Timeout wrapper for API calls
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

async function analyzeImage(base64Image: string, query: string, mimeType: string = "image/png"): Promise<string> {
  try {
    Logger.debug('🔍 [Vision] Analyzing image with Gemini...');
    
    const secureAPI = SecureAPIService.getInstance();
    
    // Try Gemini models in order of preference
    const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
    
    for (const model of models) {
      try {
        const geminiKey = await secureAPI.getGeminiKey();
        if (geminiKey) {
          Logger.debug(`🔍 [Vision] Trying ${model}...`);
          const geminiStartTime = Date.now();
          const timeoutMs = 15000; // 15 second timeout
          const response = await withTimeout(
            fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  {
                    inlineData: {
                      mimeType: mimeType,
                      data: base64Image
                    }
                  },
                  {
                    text: `Analyze this screenshot. ${query || 'Describe what you see.'}`
                  }
                ]
              }],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 1024
              },
              safetySettings: [
                {
                  category: "HARM_CATEGORY_HARASSMENT",
                  threshold: "BLOCK_NONE"
                },
                {
                  category: "HARM_CATEGORY_HATE_SPEECH", 
                  threshold: "BLOCK_NONE"
                },
                {
                  category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                  threshold: "BLOCK_NONE"
                },
                {
                  category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                  threshold: "BLOCK_NONE"
                }
              ]
            })            }),
            timeoutMs // Use dynamic timeout based on model
          );

          const geminiTime = Date.now() - geminiStartTime;
          Logger.debug(`🔍 [Vision] ${model} API call took ${geminiTime}ms`);

          if (response.ok) {
            const result = await response.json();
            Logger.debug(`🔍 [Vision] ${model} response:`, JSON.stringify(result, null, 2));
            const analysis = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            
            if (analysis) {
              Logger.debug(`✅ [Vision] ${model} analysis completed`);
              // Ultra-aggressive whitespace normalization - remove ALL line breaks, tabs, multiple spaces
              const normalized = analysis
                .replace(/[\r\n\t\v\f]+/g, ' ')  // Remove all whitespace chars
                .replace(/\s{2,}/g, ' ')          // Replace multiple spaces with single
                .replace(/\.\s+/g, '. ')          // Normalize sentence spacing
                .trim();
              return normalized;
            } else {
              Logger.warning(`⚠️ [Vision] ${model} returned empty analysis`);
              Logger.warning('⚠️ [Vision] Response candidates:', result.candidates);
              if (result.candidates?.[0]?.finishReason) {
                Logger.warning(`⚠️ [Vision] ${model} finish reason:`, result.candidates[0].finishReason);
                if (result.candidates[0].finishReason === 'SAFETY') {
                  Logger.warning(`⚠️ [Vision] ${model} blocked due to safety settings`);
                } else if (result.candidates[0].finishReason === 'MAX_TOKENS') {
                  Logger.warning(`⚠️ [Vision] ${model} hit token limit`);
                }
              }
              if (result.candidates?.[0]?.safetyRatings) {
                Logger.warning(`⚠️ [Vision] ${model} safety ratings:`, result.candidates[0].safetyRatings);
              }
              if (result.error) {
                Logger.warning(`⚠️ [Vision] ${model} error in response:`, result.error);
              }
              // Try next model instead of continuing to fallback
              continue;
            }
          } else {
            const errorText = await response.text();
            Logger.warning(`⚠️ [Vision] ${model} API failed with status ${response.status}: ${errorText}`);
            // Try next model instead of continuing to fallback
            continue;
          }
        }
      } catch (error) {
        Logger.warning(`⚠️ [Vision] ${model} failed:`, error);
        // Try next model instead of continuing to fallback
        continue;
      }
    }
    
    Logger.warning('⚠️ [Vision] All Gemini models failed, falling back to GPT-4o');

    // Fallback to OpenAI vision models
    const openaiKey = await secureAPI.getOpenAIKey();
    if (openaiKey) {
      // Try different OpenAI models that support vision
      const openaiModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4-vision-preview'];
      
      for (const model of openaiModels) {
        try {
          Logger.debug(`🔄 [Vision] Trying OpenAI ${model} with vision...`);
          
          const openaiStartTime = Date.now();
          const response = await withTimeout(
            fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${openaiKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model: model,
                messages: [
                  {
                    role: 'user',
                    content: [
                      {
                        type: 'text',
                        text: `Analyze this screenshot. ${query || 'Describe what you see.'}`
                      },
                      {
                        type: 'image_url',
                        image_url: {
                          url: `data:${mimeType};base64,${base64Image}`
                        }
                      }
                    ]
                  }
                ],
                max_tokens: 1024
              })
            }),
            10000 // 10 second timeout for OpenAI calls
          );

          const openaiTime = Date.now() - openaiStartTime;
          Logger.debug(`🔄 [Vision] OpenAI ${model} API call took ${openaiTime}ms`);

          if (response.ok) {
            const result = await response.json();
            const response_text = result.choices?.[0]?.message?.content?.trim();
            
            if (response_text) {
              Logger.debug(`✅ [Vision] OpenAI ${model} vision response completed`);
              // Ultra-aggressive whitespace normalization - remove ALL line breaks, tabs, multiple spaces
              const normalized = response_text
                .replace(/[\r\n\t\v\f]+/g, ' ')  // Remove all whitespace chars
                .replace(/\s{2,}/g, ' ')          // Replace multiple spaces with single
                .replace(/\.\s+/g, '. ')          // Normalize sentence spacing
                .trim();
              return normalized;
            }
          } else {
            const errorText = await response.text();
            Logger.warning(`⚠️ [Vision] OpenAI ${model} API failed with status ${response.status}: ${errorText}`);
            // Try next model
            continue;
          }
        } catch (error) {
          Logger.warning(`⚠️ [Vision] OpenAI ${model} failed:`, error);
          // Try next model
          continue;
        }
      }
    }
    
    Logger.warning('⚠️ [Vision] All OpenAI models failed as well');
    
    return "I successfully captured your screen, but I'm having trouble accessing the vision analysis service right now. Please try again in a moment.";
  } catch (error) {
    Logger.error('❌ [Vision] Image analysis failed:', error);
    return `I captured your screen but couldn't analyze it: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

// Export the functions for use in other modules
export { captureScreen, analyzeImage };
