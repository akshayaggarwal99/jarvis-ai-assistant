import { Logger } from '../core/logger';
import fetch, { Response, RequestInit } from 'node-fetch';

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
  retryCondition?: (error: any) => boolean;
}

export interface ApiError extends Error {
  status?: number;
  code?: string;
  retry?: boolean;
}

/**
 * Robust API caller with retry logic, timeout handling, and exponential backoff
 * Designed to handle network issues, timeouts, and temporary API failures
 */
export class RobustApiCaller {
  private static readonly DEFAULT_OPTIONS: RetryOptions = {
    maxRetries: 3,
    baseDelayMs: 1000,  // Start with 1 second
    maxDelayMs: 10000,  // Cap at 10 seconds
    timeoutMs: 60000,   // 60 second timeout for long audio uploads
    retryCondition: (error: any) => {
      // Retry on network errors, timeouts, and 5xx server errors
      if (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET' || error.code === 'ENOTFOUND') {
        return true;
      }
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        return true;
      }
      if (error.status >= 500 && error.status < 600) {
        return true;
      }
      if (error.status === 429) { // Rate limit
        return true;
      }
      // SSL/TLS errors (like the SSLV3_ALERT_BAD_RECORD_MAC from the user's issue)
      if (error.message?.includes('SSL') || error.message?.includes('TLS') || error.message?.includes('RECORD_MAC')) {
        return true;
      }
      // Generic fetch failures (network connectivity issues)
      if (error.message === 'fetch failed' || error.message?.includes('fetch failed')) {
        return true;
      }
      return false;
    }
  };

  /**
   * Execute API call with retry logic and timeout handling
   */
  static async callWithRetry<T>(
    apiCall: () => Promise<T>,
    options: Partial<RetryOptions> = {},
    context: string = 'API call'
  ): Promise<T> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    let lastError: any;
    
    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
      try {
        Logger.info(`🔄 [Robust] ${context} - Attempt ${attempt + 1}/${opts.maxRetries + 1}`);
        
        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Timeout after ${opts.timeoutMs}ms`));
          }, opts.timeoutMs);
        });
        
        // Race between API call and timeout
        const result = await Promise.race([
          apiCall(),
          timeoutPromise
        ]);
        
        Logger.info(`✅ [Robust] ${context} - Success on attempt ${attempt + 1}`);
        return result;
        
      } catch (error: any) {
        lastError = error;
        const isRetryable = opts.retryCondition!(error);
        
        Logger.warning(`❌ [Robust] ${context} - Attempt ${attempt + 1} failed:`, {
          error: error.message,
          status: error.status,
          code: error.code,
          isRetryable
        });
        
        // Log comprehensive error details for debugging
        this.logDetailedError(error, context, attempt + 1);
        
        // Don't retry on last attempt or non-retryable errors
        if (attempt === opts.maxRetries || !isRetryable) {
          // Use comprehensive error logging for final failure
          Logger.error(`🔍 [Robust] ${context} - FINAL FAILURE after ${attempt + 1} attempts`);
          this.logDetailedError(error, context, attempt + 1);
          break;
        }
        
        // Calculate delay with exponential backoff and jitter
        const delay = Math.min(
          opts.baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
          opts.maxDelayMs
        );
        
        Logger.info(`⏳ [Robust] Retrying ${context} in ${Math.round(delay)}ms...`);
        await this.sleep(delay);
      }
    }
    
    // All attempts failed
    const enhancedError = new Error(
      `${context} failed after ${opts.maxRetries + 1} attempts. Last error: ${lastError?.message || 'Unknown error'}`
    ) as ApiError;
    
    enhancedError.status = lastError?.status;
    enhancedError.code = lastError?.code;
    enhancedError.retry = false;
    
    throw enhancedError;
  }

  /**
   * Fetch with timeout and retry logic
   */
  static async fetchWithRetry(
    url: string,
    options: RequestInit = {},
    retryOptions: Partial<RetryOptions> = {},
    context: string = 'Fetch'
  ): Promise<Response> {
    const opts = { ...this.DEFAULT_OPTIONS, ...retryOptions };
    
    return this.callWithRetry(async () => {
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs);
      
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        // Handle non-2xx responses
        if (!response.ok) {
          // Try to read response body for detailed error information
          let errorDetails = '';
          try {
            const responseText = await response.text();
            errorDetails = responseText ? ` - ${responseText}` : '';
            
            // Log specific details for multipart form errors
            if (responseText?.includes('multipart') || responseText?.includes('form')) {
              Logger.error(`🔍 [FetchWithRetry] Multipart form error detected:`, {
                url,
                status: response.status,
                statusText: response.statusText,
                responseBody: responseText,
                requestHeaders: Object.keys(options.headers || {}),
                hasFormDataBody: options.body && options.body.constructor?.name === 'FormData'
              });
            }
          } catch (bodyError) {
            errorDetails = ' - (could not read response body)';
          }
          
          const error = new Error(`HTTP ${response.status}: ${response.statusText}${errorDetails}`) as ApiError;
          error.status = response.status;
          throw error;
        }
        
        return response;
      } catch (error: any) {
        clearTimeout(timeoutId);
        
        // Convert AbortError to TimeoutError for clarity
        if (error.name === 'AbortError') {
          const timeoutError = new Error(`Request timeout after ${opts.timeoutMs}ms`) as ApiError;
          timeoutError.name = 'TimeoutError';
          timeoutError.code = 'ETIMEDOUT';
          throw timeoutError;
        }

        // Log immediate fetch failure details for "fetch failed" errors
        if (error.message?.includes('fetch failed') || error.name === 'FetchError') {
          Logger.error(`🔍 [FetchWithRetry] Immediate fetch failure details:`, {
            url,
            message: error.message,
            name: error.name,
            code: error.code,
            cause: error.cause ? {
              message: error.cause.message,
              code: error.cause.code,
              errno: error.cause.errno,
              syscall: error.cause.syscall,
              address: error.cause.address
            } : null,
            headers: options.headers ? Object.keys(options.headers) : 'none',
            method: options.method || 'GET',
            bodyType: options.body ? (options.body.constructor?.name || typeof options.body) : 'none'
          });
        }
        
        throw error;
      }
    }, retryOptions, context);
  }

  /**
   * Enhanced error analysis for better debugging
   */
  static analyzeError(error: any): {
    category: 'network' | 'timeout' | 'server' | 'client' | 'ssl' | 'unknown';
    isRetryable: boolean;
    suggestion: string;
  } {
    const message = error.message?.toLowerCase() || '';
    const code = error.code;
    const status = error.status;
    
    // SSL/TLS errors
    if (message.includes('ssl') || message.includes('tls') || message.includes('record_mac') || 
        message.includes('certificate') || message.includes('handshake')) {
      return {
        category: 'ssl',
        isRetryable: true,
        suggestion: 'SSL/TLS connection issue. Retrying may help as this is often temporary.'
      };
    }
    
    // Network errors
    if (code === 'ECONNRESET' || code === 'ENOTFOUND' || code === 'ECONNREFUSED' || 
        message.includes('network') || message.includes('connection') || 
        message === 'fetch failed' || message.includes('fetch failed')) {
      return {
        category: 'network',
        isRetryable: true,
        suggestion: 'Network connectivity issue. Check internet connection and retry.'
      };
    }
    
    // Timeout errors
    if (code === 'ETIMEDOUT' || message.includes('timeout') || error.name === 'TimeoutError') {
      return {
        category: 'timeout',
        isRetryable: true,
        suggestion: 'Request timed out. Try breaking audio into smaller chunks.'
      };
    }
    
    // Server errors (5xx)
    if (status >= 500 && status < 600) {
      return {
        category: 'server',
        isRetryable: true,
        suggestion: 'Server error. The service may be temporarily unavailable.'
      };
    }
    
    // Client errors (4xx)
    if (status >= 400 && status < 500) {
      const isRetryable = status === 429; // Rate limit
      return {
        category: 'client',
        isRetryable,
        suggestion: isRetryable ? 'Rate limited. Will retry with backoff.' : 'Client error. Check API key and request format.'
      };
    }
    
    return {
      category: 'unknown',
      isRetryable: false,
      suggestion: 'Unknown error. Manual investigation required.'
    };
  }

  /**
   * Sleep utility for delays
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Detailed error logging for comprehensive debugging
   */
  private static logDetailedError(error: any, context: string, attempt: number): void {
    const errorDetails: any = {
      attempt,
      message: error.message,
      name: error.name,
      code: error.code,
      status: error.status,
      type: typeof error,
      constructor: error.constructor?.name,
      keys: Object.keys(error).filter(key => key !== 'stack') // Exclude stack from keys to reduce noise
    };

    // Extract cause details if available
    if (error.cause) {
      errorDetails.cause = {
        message: error.cause.message,
        name: error.cause.name,
        code: error.cause.code,
        errno: error.cause.errno,
        syscall: error.cause.syscall,
        address: error.cause.address,
        port: error.cause.port,
        type: typeof error.cause,
        constructor: error.cause.constructor?.name,
        // Try to get additional Node.js specific error properties
        ...(error.cause.errno && { errnoString: require('util').getSystemErrorName?.(error.cause.errno) }),
        ...(error.cause.path && { path: error.cause.path })
      };
    }

    // Extract fetch-specific details
    if (error.message?.includes('fetch failed') || error.name === 'FetchError') {
      errorDetails.fetchDetails = {
        url: error.url || 'unknown',
        type: error.type,
        reason: error.reason,
        // Check if there's a nested error
        nestedError: error.errno ? {
          errno: error.errno,
          code: error.code,
          syscall: error.syscall,
          hostname: error.hostname,
          port: error.port,
          address: error.address
        } : null
      };
    }

    // Check for SSL/TLS specific errors
    if (error.message?.includes('SSL') || error.message?.includes('TLS') || error.code?.includes('SSL')) {
      errorDetails.sslDetails = {
        opensslErrorStack: error.opensslErrorStack,
        library: error.library,
        function: error.function,
        reason: error.reason,
        opensslReason: error.opensslReason
      };
    }

    // Include limited stack trace (first 5 lines to see immediate call path)
    if (error.stack) {
      errorDetails.stackTrace = error.stack.split('\n').slice(0, 5);
    }

    Logger.error(`🔍 [Robust] ${context} - Detailed error analysis (attempt ${attempt}):`, errorDetails);
    
    // For fetch failed errors, also log the raw error object
    if (error.message?.includes('fetch failed')) {
      Logger.error(`🔍 [Robust] ${context} - Raw fetch error object:`, {
        ...error,
        // Don't duplicate stack in the raw object
        stack: '[truncated - see stackTrace above]'
      });
    }
  }

  /**
   * Create a timeout-safe FormData upload function
   */
  static async createTimeoutSafeUpload(
    formData: any, // Accept both Web FormData and node FormData
    url: string,
    headers: Record<string, string> = {},
    timeoutMs: number = 60000
  ): Promise<Response> {
    return this.fetchWithRetry(
      url,
      {
        method: 'POST',
        headers,
        body: formData
      },
      {
        timeoutMs,
        maxRetries: 2, // Fewer retries for uploads to avoid excessive data transfer
        baseDelayMs: 2000 // Longer initial delay for uploads
      },
      'File upload'
    );
  }
}