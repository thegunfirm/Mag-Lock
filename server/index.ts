import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import samlRoutes from "./saml-routes";
import { registerStateComplianceRoutes } from "./routes/state-compliance-routes";
import passport from 'passport';

// Set Zoho environment variables - using webservices app credentials for tech@thegunfirm.com
// Only set if Zoho is enabled
if (ZOHO_ENABLED) {
  if (!process.env.ZOHO_CLIENT_ID) {
    // Use webservices app credentials if available, otherwise use existing
    process.env.ZOHO_CLIENT_ID = process.env.ZOHO_WEBSERVICES_CLIENT_ID || "1000.8OVSJ4V07OOVJWYAC0KA1JEFNH2W3M";
  }
  if (!process.env.ZOHO_CLIENT_SECRET) {
    process.env.ZOHO_CLIENT_SECRET = process.env.ZOHO_WEBSERVICES_CLIENT_SECRET || "4d4b2ab7f0f731102c7d15d6754f1f959251db68e0";
  }
  if (!process.env.ZOHO_REDIRECT_URI) {
    // Use current Replit domain for OAuth callback - this was the working pattern
    const replitDomain = process.env.REPLIT_DEV_DOMAIN || process.env.REPL_SLUG + '.replit.dev';
    process.env.ZOHO_REDIRECT_URI = `https://${replitDomain}/api/zoho/auth/callback`;
  }
  if (!process.env.ZOHO_ACCOUNTS_HOST) {
    process.env.ZOHO_ACCOUNTS_HOST = "https://accounts.zoho.com";
  }
  if (!process.env.ZOHO_CRM_BASE) {
    process.env.ZOHO_CRM_BASE = "https://www.zohoapis.com";
  }
}

// Set SAML environment variables for development if SAML is enabled
if (SAML_ENABLED) {
  if (!process.env.SAML_IDP_SSO_URL) {
    process.env.SAML_IDP_SSO_URL = "https://directory.zoho.com/p/896141717/app/1079411000000002069/sso";
  }
  if (!process.env.SAML_IDP_CERT_PEM) {
    process.env.SAML_IDP_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIICkTCCAXkCBgGYmqHaXDANBgkqhkiG9w0BAQsFADAMMQowCAYDVQQDEwFBMB4XDTI1MDgxMDE5
MzU1NVoXDTI4MDgxMDE5MzU1NVowDDEKMAgGA1UEAxMBQTCCASIwDQYJKoZIhvcNAQEBBQADggEP
ADCCAQoCggEBAIM04EXBwhjRwPnL5Xm0rSQuYjER2ehzIyI03q7cZf4Q1Ca8WbR9oijVYnfUm7Yn
9/eJmb9gYLWUdlwk1sDFFzktoaFDMHlSYJ46/+Feue5ZUq+DflX7MhGhQmIXD6CuOoLbnohO9KhD
6aOvJLqQCyC90IZsmoipHKZ0ANKmmngYRgciMaPEvF9s7TcS41Dv9RWXdni4klJ1eGvfKMEQ5FVK
h5X38XKK5VcCpf9/XYPnm1K0x8QGs7Xp7yJZp0s/V8KiVvBJbDodKdfYbOkRaJ4FdhF1cfT0tgMv
rI1rCVHxoamUlMC5cPNnf9kjPB8O/tljD1PySpYYzrUI2SPMiVcCAwEAATANBgkqhkiG9w0BAQsF
AAOCAQEADqKELbE4Lwj+aWcNVt1APEeBAaBCi8vgi5v0uTqNJIhwxXSoemKMpSAwatZMCQyuHiYX
J8/cHqfSXjB/Mzpu+LSVY9jxOBvreNYMgSTMUcqml08FvBcDyx6veJ4z2H9SqFPE4u4X5SPZapiO
CZbI6uh0+98gsRPtPsckrRIvKIN4o4PmvEthxjSa6dJsKjou+BlQJLc/X1cq/RKv5TparbNsXJA7
KWO0DvHU3fepnVxnSRjeSesTW5HRhwsUY+6F5oYrm7EhFbuKs7ME3hS3a24lVtohMXj03BT8Rufo
pN//dmyyguzXinHO767hD8PzMTxoy3hvgfox1Bo5xrw5ig==
-----END CERTIFICATE-----`;
  }
  if (!process.env.SAML_REQUIRE_SIGNED_ASSERTIONS) {
    process.env.SAML_REQUIRE_SIGNED_ASSERTIONS = "true";
  }
  if (!process.env.SAML_CLOCK_SKEW_SEC) {
    process.env.SAML_CLOCK_SKEW_SEC = "300";
  }
}
import { setupVite, serveStatic, log } from "./vite";
import { rsrAutoSync } from "./services/rsr-auto-sync";
import { pricingService } from "./services/pricing-service";
import { automaticZohoTokenManager } from "./services/automatic-zoho-token-manager";
import { ZOHO_ENABLED, SAML_ENABLED } from "./config/features";
import { pool } from "./db";
import { createApiGateMiddleware } from "./middleware/api-gate";

const app = express();
const serverStartTime = Date.now();

// NEVER let homepage endpoints return non-arrays
app.use((req: any, res: any, next: any) => {
  const send = res.json.bind(res);
  res.json = (body: any) => {
    if (
      req.path === '/api/products/featured' ||
      req.path === '/api/carousel/slides' ||
      req.path === '/api/category-ribbons/active'
    ) {
      // if not an array, coerce to [] or [object] so UI .map() is safe
      const out = Array.isArray(body) ? body : (body ? [body] : []);
      return send(out);
    }
    return send(body);
  };
  next();
});

// === TEMP: proxy /api/products/:id to Algolia (no DB) ===
app.use(async (req: any, res: any, next: any) => {
  try {
    if (req.method !== 'GET') return next();

    // Hard skip for featured/search/category paths
    if (req.path === '/api/products/featured' ||
        req.path.startsWith('/api/products/search') ||
        req.path.startsWith('/api/products/category')) {
      return next(); // let the real handlers run (featured must return an ARRAY)
    }

    const basePath = '/api/products/';
    if (!req.path.startsWith(basePath)) return next();

    const key = decodeURIComponent(req.path.slice(basePath.length));
    const reserved = new Set(['featured', 'search', 'category', 'by-object', 'by-id']);
    if (!key || key.includes('/') || reserved.has(key)) return next(); // let other routes handle

    const base = `https://${process.env.ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/products`;
    const headers: Record<string, string> = {
      'X-Algolia-API-Key': process.env.ALGOLIA_API_KEY || '',
      'X-Algolia-Application-Id': process.env.ALGOLIA_APP_ID || '',
      'Accept': 'application/json'
    };

    // Non-numeric: treat as Algolia objectID / stockNumber
    if (!/^[0-9]+$/.test(key)) {
      const r = await fetch(`${base}/${encodeURIComponent(key)}`, { headers });
      if (r.ok) return res.json(await r.json());
      // fallback: query by text
      const rq = await fetch(`${base}/query`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ params: `query=${encodeURIComponent(key)}&hitsPerPage=1` })
      });
      const data = await rq.json().catch(() => ({}));
      const hit = Array.isArray((data as any).hits) ? (data as any).hits[0] : null;
      return hit ? res.json(hit) : res.status(404).json({ message: 'Not found' });
    }

    // Numeric: try numericFilters on id, fallback to text
    const rq = await fetch(`${base}/query`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ params: `numericFilters=id=${key}&hitsPerPage=1` })
    });
    let data = await rq.json().catch(() => ({}));
    let hit = Array.isArray((data as any).hits) ? (data as any).hits[0] : null;

    if (!hit) {
      const rq2 = await fetch(`${base}/query`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ params: `query=${encodeURIComponent(key)}&hitsPerPage=1` })
      });
      data = await rq2.json().catch(() => ({}));
      hit = Array.isArray((data as any).hits) ? (data as any).hits[0] : null;
    }

    return hit ? res.json(hit) : res.status(404).json({ message: 'Not found' });
  } catch {
    return res.status(500).json({ message: 'Algolia detail failed' });
  }
});

// Create PostgreSQL session store
const PgSession = connectPgSimple(session);
const sessionStore = new PgSession({
  pool: pool as any, // Type casting needed for compatibility
  tableName: 'session',
  createTableIfMissing: true
});

// Apply API Gate middleware BEFORE body parsers and routes
// This must come after CORS (if any) but before other middleware
app.use(createApiGateMiddleware());

// Health check endpoint (public, no auth required)
app.get('/api/health', (req, res) => {
  const uptimeSec = Math.floor((Date.now() - serverStartTime) / 1000);
  res.json({
    status: 'ok',
    uptimeSec,
    version: '1.0.0',
    time: new Date().toISOString()
  });
});

// 🔎 Probe: log which /api/* endpoints the confirmation page hits
app.use((req, res, next) => {
  if (req.url.startsWith('/api/')) {
    const len = Number(req.headers['content-length'] || 0) || 0;
    console.log(`[API] ${req.method} ${req.url} len=${len}`);
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session configuration with PostgreSQL store
app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'your-secret-key-here',
  resave: false,
  saveUninitialized: true, // Changed to true for OAuth state persistence
  cookie: {
    secure: false, // Set to true if using HTTPS
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    sameSite: 'lax' // Added for better cross-site compatibility
  }
}));

// Initialize Passport for SAML authentication, but skip for local auth endpoints
app.use((req, res, next) => {
  // Skip Passport processing for local authentication endpoints
  if (req.path === '/api/login' || req.path === '/api/register') {
    return next();
  }
  passport.initialize()(req, res, next);
});

app.use((req, res, next) => {
  // Skip Passport session processing for local authentication endpoints
  if (req.path === '/api/login' || req.path === '/api/register') {
    return next();
  }
  passport.session()(req, res, next);
});

// Passport session serialization
passport.serializeUser((user: any, done) => {
  done(null, user);
});

passport.deserializeUser((user: any, done) => {
  done(null, user);
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize pricing service
  await pricingService.initializeDefaultPricing();
  
  // Initialize automatic Zoho token management if enabled
  if (ZOHO_ENABLED) {
    try {
      // Start the automatic token manager
      const token = await automaticZohoTokenManager.ensureValidToken();
      if (token) {
        console.log('✅ Automatic Zoho token management started successfully');
        console.log('🔄 Tokens will refresh automatically every 50 minutes');
      } else {
        console.log('⚠️ No valid Zoho tokens - will refresh when available');
      }
    } catch (error) {
      console.error('⚠️ Failed to initialize automatic token management:', error);
    }
  }
  
  // Auto-sync disabled during data integrity work
  // rsrAutoSync.start();
  
  // Register SAML routes if SAML is enabled
  if (SAML_ENABLED) {
    app.use('/sso/saml', samlRoutes);
  }
  
  // NEW: mount the order routes
  const { default: orderNumberRouter } = await import('./routes/orderNumber.js');
  const { default: orderSummaryRouter } = await import('./routes/orderSummary.js');
  // const { default: orderSnapshotRouter } = await import('./routes/orderSnapshot.js');
  // const { default: orderSummaryByIdRouter } = await import('./routes/orderSummaryById.cjs');
  app.use(orderNumberRouter);
  app.use(orderSummaryRouter);
  // app.use(orderSnapshotRouter);
  // app.use(orderSummaryByIdRouter);
  
  // Image verifier for local /images/* URLs
  // const imageVerifyRouter = await import('./routes/imageVerify.cjs');
  // app.use(imageVerifyRouter.default);
  
  // === TEMP: Algolia-only products list (no DB enrich) ===
  app.get('/api/products', async (req: any, res: any) => {
    try {
      const q = typeof (req.query as any).q === 'string' ? (req.query as any).q : '';
      const limit = Number.parseInt(String((req.query as any).limit ?? '20'), 10) || 20;
      const r = await fetch(
        `https://${process.env.ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/products/query`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Algolia-API-Key': process.env.ALGOLIA_API_KEY || '',
            'X-Algolia-Application-Id': process.env.ALGOLIA_APP_ID || '',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ params: `query=${encodeURIComponent(q)}&hitsPerPage=${limit}` }),
        }
      );
      const data = await r.json().catch(() => ({}));
      return Array.isArray((data as any).hits) ? res.json((data as any).hits) : res.json([]);
    } catch { return res.json([]); }
  });

  // === TEMP: Algolia-only search ===
  app.get('/api/products/search', async (req: any, res: any) => {
    try {
      const q = typeof (req.query as any).q === 'string' ? (req.query as any).q : '';
      const limit = Number.parseInt(String((req.query as any).limit ?? '20'), 10) || 20;
      const r = await fetch(
        `https://${process.env.ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/products/query`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Algolia-API-Key': process.env.ALGOLIA_API_KEY || '',
            'X-Algolia-Application-Id': process.env.ALGOLIA_APP_ID || '',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ params: `query=${encodeURIComponent(q)}&hitsPerPage=${limit}` }),
        }
      );
      const data = await r.json().catch(() => ({}));
      return Array.isArray((data as any).hits) ? res.json((data as any).hits) : res.json([]);
    } catch { return res.json([]); }
  });

  // === TEMP: homepage placeholders (never crash UI) ===
  app.get('/api/carousel/slides', (_req, res) => res.json([]));
  app.get('/api/category-ribbons/active', (_req, res) => res.json([]));

  // === TEMP: featured products from Algolia ===
  app.get('/api/products/featured', async (_req, res) => {
    try {
      const base = `https://${process.env.ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/products`;
      const r = await fetch(`${base}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Algolia-API-Key': process.env.ALGOLIA_API_KEY || '',
          'X-Algolia-Application-Id': process.env.ALGOLIA_APP_ID || '',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ params: 'query=&hitsPerPage=8' })
      });
      const data = await r.json().catch(() => ({}));
      return Array.isArray((data as any).hits) ? res.json((data as any).hits) : res.json([]);
    } catch { return res.json([]); }
  });

  // === OPTIONAL: category via Algolia facets (adjust field if needed) ===
  app.get('/api/products/category/:category', async (req: any, res: any) => {
    try {
      const cat = String(req.params.category || '');
      const base = `https://${process.env.ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/products`;
      const r = await fetch(`${base}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Algolia-API-Key': process.env.ALGOLIA_API_KEY || '',
          'X-Algolia-Application-Id': process.env.ALGOLIA_APP_ID || '',
          'Accept': 'application/json',
        },
        // If your index uses another field (e.g., "categoryName"), change here:
        body: JSON.stringify({ params: `query=&facetFilters=category:${encodeURIComponent(cat)}&hitsPerPage=24` })
      });
      const data = await r.json().catch(() => ({}));
      return Array.isArray((data as any).hits) ? res.json((data as any).hits) : res.json([]);
    } catch { return res.json([]); }
  });
  
  // PUBLIC branding JSON (no Cloudflare Access)
  app.get('/branding.json', (_req, res) => {
    res.json({ heroSlides: [], categoryRibbons: [] });
  });
  
  const server = await registerRoutes(app);
  
  // Register state compliance routes
  registerStateComplianceRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
