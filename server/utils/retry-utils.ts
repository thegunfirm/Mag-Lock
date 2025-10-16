/**
 * Centralized retry/backoff utility for resilient API calls
 */

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  jitterFactor?: number;
  shouldRetry?: (error: any, attempt: number) => boolean;
  onRetry?: (error: any, attempt: number, nextDelay: number) => void;
  context?: string;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: any;
  attempts: number;
  finalError?: any;
}

/**
 * Default error classification for retry strategy
 */
function defaultShouldRetry(error: any, attempt: number): boolean {
  // Don't retry if max attempts reached
  if (attempt >= 3) return false;

  // Network errors - always retry
  if (error.code === 'ECONNREFUSED' || 
      error.code === 'ENOTFOUND' || 
      error.code === 'ETIMEDOUT' ||
      error.code === 'ECONNRESET' ||
      error.code === 'EPIPE' ||
      error.code === 'ENETUNREACH') {
    return true;
  }

  // Check for HTTP status codes if available
  const status = error.response?.status || error.statusCode || error.status;
  
  if (status) {
    // 5xx errors - server errors, retry
    if (status >= 500 && status < 600) {
      return true;
    }
    
    // 429 rate limit - always retry with longer backoff
    if (status === 429) {
      return true;
    }
    
    // 408 request timeout - retry
    if (status === 408) {
      return true;
    }
    
    // 4xx errors (except 429, 408) - don't retry
    if (status >= 400 && status < 500) {
      return false;
    }
  }
  
  // FTP specific errors
  if (error.message?.includes('Client is closed') || 
      error.message?.includes('FIN packet') ||
      error.message?.includes('timeout')) {
    return true;
  }
  
  // Default: don't retry unknown errors
  return false;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(
  attempt: number, 
  baseDelay: number, 
  maxDelay: number, 
  jitterFactor: number,
  error?: any
): number {
  // Check for Retry-After header (rate limiting)
  if (error?.response?.headers?.['retry-after']) {
    const retryAfter = error.response.headers['retry-after'];
    // If it's a number, it's seconds; if it's a date, parse it
    const delay = isNaN(Number(retryAfter)) 
      ? Math.max(0, new Date(retryAfter).getTime() - Date.now())
      : Number(retryAfter) * 1000;
    
    return Math.min(delay, maxDelay);
  }
  
  // For 429 rate limit errors, use longer backoff
  const status = error?.response?.status || error?.statusCode || error?.status;
  if (status === 429) {
    baseDelay = baseDelay * 2; // Double the base delay for rate limits
  }
  
  // Exponential backoff: baseDelay * (2 ^ attempt)
  let delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  
  // Add jitter to prevent thundering herd
  const jitter = delay * jitterFactor * Math.random();
  delay = delay + jitter;
  
  return Math.round(delay);
}

/**
 * Sleep utility for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const {
    maxRetries = 3,
    baseDelay = 1000, // 1 second
    maxDelay = 30000, // 30 seconds
    jitterFactor = 0.3, // 30% jitter
    shouldRetry = defaultShouldRetry,
    onRetry,
    context = 'API call'
  } = options;
  
  let lastError: any;
  let attempts = 0;
  
  while (attempts < maxRetries) {
    try {
      attempts++;
      
      // Try to execute the function
      const data = await fn();
      
      // Success!
      if (attempts > 1) {
        console.log(`✅ ${context} succeeded after ${attempts} attempts`);
      }
      
      return {
        success: true,
        data,
        attempts
      };
      
    } catch (error: any) {
      lastError = error;
      
      // Check if we should retry
      if (!shouldRetry(error, attempts)) {
        console.error(`❌ ${context} failed - not retryable:`, error.message || error);
        break;
      }
      
      // Check if we've exhausted retries
      if (attempts >= maxRetries) {
        console.error(`❌ ${context} failed after ${attempts} attempts:`, error.message || error);
        break;
      }
      
      // Calculate delay for next retry
      const delay = calculateDelay(attempts - 1, baseDelay, maxDelay, jitterFactor, error);
      
      // Log retry attempt
      console.log(`⚠️ ${context} failed (attempt ${attempts}/${maxRetries}), retrying in ${delay}ms...`);
      console.log(`  Error: ${error.message || error.code || 'Unknown error'}`);
      
      // Call retry callback if provided
      if (onRetry) {
        onRetry(error, attempts, delay);
      }
      
      // Wait before retrying
      await sleep(delay);
    }
  }
  
  // All retries exhausted
  return {
    success: false,
    error: lastError,
    finalError: lastError,
    attempts
  };
}

/**
 * Circuit breaker implementation for repeated failures
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  constructor(
    private readonly threshold = 5,
    private readonly timeout = 60000, // 1 minute
    private readonly name = 'Circuit'
  ) {}
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.lastFailureTime;
      
      if (elapsed < this.timeout) {
        throw new Error(`${this.name} circuit breaker is OPEN - service unavailable`);
      }
      
      // Try to recover
      this.state = 'HALF_OPEN';
      console.log(`🔄 ${this.name} circuit breaker attempting recovery (HALF_OPEN)`);
    }
    
    try {
      const result = await fn();
      
      // Success - reset circuit
      if (this.state === 'HALF_OPEN') {
        console.log(`✅ ${this.name} circuit breaker recovered (CLOSED)`);
      }
      
      this.state = 'CLOSED';
      this.failures = 0;
      
      return result;
      
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();
      
      if (this.failures >= this.threshold) {
        this.state = 'OPEN';
        console.error(`🚫 ${this.name} circuit breaker OPEN after ${this.failures} failures`);
      }
      
      throw error;
    }
  }
  
  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailure: this.lastFailureTime ? new Date(this.lastFailureTime) : null
    };
  }
  
  reset() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.lastFailureTime = 0;
    console.log(`🔄 ${this.name} circuit breaker manually reset`);
  }
}

/**
 * Create a retry wrapper for a specific service
 */
export function createRetryWrapper(
  serviceName: string,
  defaultOptions: Partial<RetryOptions> = {}
) {
  const circuitBreaker = new CircuitBreaker(5, 60000, serviceName);
  
  return {
    async execute<T>(
      fn: () => Promise<T>,
      options: Partial<RetryOptions> = {}
    ): Promise<T> {
      const mergedOptions = {
        ...defaultOptions,
        ...options,
        context: options.context || `${serviceName} operation`
      };
      
      try {
        // Execute with circuit breaker
        return await circuitBreaker.execute(async () => {
          const result = await withRetry(fn, mergedOptions);
          
          if (!result.success) {
            throw result.error || new Error(`${serviceName} operation failed`);
          }
          
          return result.data!;
        });
      } catch (error: any) {
        // Log circuit breaker state on failure
        const state = circuitBreaker.getState();
        if (state.state === 'OPEN') {
          console.error(`⚠️ ${serviceName} circuit breaker status:`, state);
        }
        
        throw error;
      }
    },
    
    getCircuitState() {
      return circuitBreaker.getState();
    },
    
    resetCircuit() {
      circuitBreaker.reset();
    }
  };
}