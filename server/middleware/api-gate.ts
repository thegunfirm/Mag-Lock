import type { Request, Response, NextFunction } from "express";

/**
 * API Gate Middleware with CloudFlare Access Edge Authentication
 * 
 * Protects /api/* endpoints with dual authentication:
 * 1. CloudFlare Access authenticated user (CF-Access-Authenticated-User-Email header)
 *    CloudFlare has already authenticated at the edge, we just check for the header
 * 2. Service key authentication (X-Service-Key header) for server-to-server calls
 * 
 * Reads configuration from environment variables:
 * - CF_ACCESS_TEAM_DOMAIN: CloudFlare Access team domain (kept for reference, not used)
 * - CF_ACCESS_AUD: CloudFlare Access audience claim (kept for reference, not used)
 * - SERVICE_KEY: The secret key for service authentication
 * - SERVICE_KEY_HEADER: The header name for service key (default: 'X-Service-Key')
 * - ENFORCE_API_GATE: Whether to enforce authentication (uses env value)
 */

// CloudFlare Access authenticated user email header
const CF_ACCESS_USER_EMAIL_HEADER = 'cf-access-authenticated-user-email';

// Public endpoints that don't require authentication (exact list)
const PUBLIC_ENDPOINTS = [
  { method: 'GET', path: '/api/health' },
  { method: 'POST', path: '/api/webhooks/anet' },
  { method: 'POST', path: '/api/webhooks/rsr' },
  { method: 'GET', path: '/api/categories' },
  { method: 'GET', path: '/api/featured' },
  { method: 'GET', path: '/api/products/featured' },
  { method: 'GET', path: '/api/carousel/slides' },
  { method: 'GET', path: '/api/category-ribbons/active' },
  { method: 'GET', path: '/api/products' },
  { method: 'POST', path: '/api/search/algolia' },
  { method: 'POST', path: '/api/search/suggestions' },
  { method: 'POST', path: '/api/search/filter-options' },
];

// Check if endpoint is public (doesn't require authentication)
function isPublicEndpoint(method: string, path: string): boolean {
  // OPTIONS requests are always public (CORS preflight)
  if (method === 'OPTIONS') {
    return true;
  }

  // Check exact matches
  if (PUBLIC_ENDPOINTS.some(endpoint => 
    endpoint.method === method && endpoint.path === path
  )) {
    return true;
  }

  // Check wildcard matches (any /api/webhooks/* route)
  if (path.startsWith('/api/webhooks/')) {
    return true;
  }

  // Check image endpoint (public for product images)
  if (method === 'GET' && path.startsWith('/api/image/')) {
    return true;
  }

  return false;
}

// Anonymize IP address for logging (keep first 2 octets)
function anonymizeIP(ip: string | undefined): string {
  if (!ip) return 'unknown';
  
  // Handle IPv6
  if (ip.includes(':')) {
    const parts = ip.split(':');
    return parts.slice(0, 2).join(':') + ':****';
  }
  
  // Handle IPv4
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.***.***`;
  }
  
  return 'unknown';
}

// Get client IP from various headers and express
function getClientIP(req: Request): string | undefined {
  return (
    req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
    req.headers['x-real-ip']?.toString() ||
    req.socket?.remoteAddress ||
    req.ip
  );
}


/**
 * API Gate Middleware Factory
 * 
 * Creates middleware that enforces authentication on /api/* routes
 * Accepts either CloudFlare Access authenticated user email or Service Key
 */
export function createApiGateMiddleware() {
  // Read configuration from environment
  const SERVICE_KEY = process.env.SERVICE_KEY;
  const SERVICE_KEY_HEADER = process.env.SERVICE_KEY_HEADER || 'X-Service-Key';
  const ENFORCE_API_GATE = process.env.ENFORCE_API_GATE === 'true';
  // Keep these for reference but don't use them
  const CF_ACCESS_TEAM_DOMAIN = process.env.CF_ACCESS_TEAM_DOMAIN;
  const CF_ACCESS_AUD = process.env.CF_ACCESS_AUD;

  // Log initialization
  if (!ENFORCE_API_GATE) {
    console.log('🔓 API Gate is DISABLED - endpoints are not protected');
  } else {
    console.log(`🔒 API Gate is ENABLED - protecting /api/* endpoints`);
    console.log(`   - CloudFlare Access: Checking for authenticated user email header`);
    
    if (SERVICE_KEY) {
      console.log(`   - Service Key header: ${SERVICE_KEY_HEADER}`);
    } else {
      console.log('   - Service Key: Not configured');
    }
  }

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Only apply to /api/* routes
    if (!req.path.startsWith('/api/')) {
      return next();
    }

    // Check if endpoint is public
    if (isPublicEndpoint(req.method, req.path)) {
      return next();
    }

    // If enforcement is disabled, allow through
    if (!ENFORCE_API_GATE) {
      return next();
    }

    // Check for CloudFlare Access authenticated user email header
    // If CloudFlare authenticated the user at the edge, this header will be present
    const cfUserEmail = req.headers[CF_ACCESS_USER_EMAIL_HEADER]?.toString();
    if (cfUserEmail) {
      // CloudFlare has already authenticated this user at the edge - allow request
      return next();
    }

    // Check for Service Key as fallback for server-to-server calls
    const providedKey = req.headers[SERVICE_KEY_HEADER.toLowerCase()]?.toString() || 
                       req.headers[SERVICE_KEY_HEADER]?.toString();

    if (providedKey && SERVICE_KEY && providedKey === SERVICE_KEY) {
      // Valid service key - allow request
      return next();
    }

    // No valid authentication provided
    const clientIP = getClientIP(req);
    console.log(
      `🚫 API Gate blocked: ${req.method} ${req.path} - No valid authentication ` +
      `(IP: ${anonymizeIP(clientIP)})`
    );

    // Return appropriate error based on what's configured
    if (!SERVICE_KEY) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'API authentication is misconfigured - no service key configured'
      });
      return;
    }

    res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid authentication required',
      headers: {
        cloudflare: CF_ACCESS_USER_EMAIL_HEADER,
        service: SERVICE_KEY_HEADER
      }
    });
  };
}

// Default export for convenience
export default createApiGateMiddleware;