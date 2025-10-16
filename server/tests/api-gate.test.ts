import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import express, { Application } from 'express';
import { createApiGateMiddleware } from '../middleware/api-gate';

/**
 * Comprehensive tests for API Gate middleware
 * 
 * These tests verify that:
 * - Public endpoints work without authentication
 * - Protected endpoints require valid service keys
 * - Invalid keys are rejected properly
 * - OPTIONS requests pass through (CORS)
 * - Webhook endpoints are public
 */

describe('API Gate Middleware', () => {
  let app: Application;
  const originalEnv = process.env;
  
  // Helper to create test app with middleware
  function createTestApp(config?: {
    serviceKey?: string;
    headerName?: string;
    enforceGate?: boolean;
  }): Application {
    const testApp = express();
    
    // Set environment variables for test
    if (config?.serviceKey !== undefined) {
      process.env.SERVICE_KEY = config.serviceKey;
    }
    if (config?.headerName !== undefined) {
      process.env.SERVICE_KEY_HEADER = config.headerName;
    }
    if (config?.enforceGate !== undefined) {
      process.env.ENFORCE_API_GATE = config.enforceGate.toString();
    }
    
    // Apply middleware
    testApp.use(createApiGateMiddleware());
    
    // Add test routes
    testApp.get('/api/health', (req, res) => {
      res.json({ status: 'ok' });
    });
    
    testApp.get('/api/products', (req, res) => {
      res.json({ products: [] });
    });
    
    testApp.post('/api/webhooks/anet', (req, res) => {
      res.json({ webhook: 'anet' });
    });
    
    testApp.post('/api/webhooks/rsr', (req, res) => {
      res.json({ webhook: 'rsr' });
    });
    
    testApp.post('/api/webhooks/custom', (req, res) => {
      res.json({ webhook: 'custom' });
    });
    
    testApp.options('/api/products', (req, res) => {
      res.status(204).send();
    });
    
    testApp.get('/non-api/route', (req, res) => {
      res.json({ route: 'non-api' });
    });
    
    return testApp;
  }
  
  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('When API Gate is disabled', () => {
    beforeAll(() => {
      app = createTestApp({
        serviceKey: 'test-key-123',
        enforceGate: false
      });
    });

    it('should allow all requests without authentication', async () => {
      const response = await request(app)
        .get('/api/products')
        .expect(200);
      
      expect(response.body).toEqual({ products: [] });
    });

    it('should log that gate is disabled', async () => {
      const consoleSpy = jest.spyOn(console, 'log');
      
      await request(app).get('/api/products');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('API Gate disabled')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('When API Gate is enabled', () => {
    beforeAll(() => {
      app = createTestApp({
        serviceKey: 'secret-key-456',
        headerName: 'X-Service-Key',
        enforceGate: true
      });
    });

    describe('Public endpoints', () => {
      it('should allow GET /api/health without authentication', async () => {
        const response = await request(app)
          .get('/api/health')
          .expect(200);
        
        expect(response.body).toEqual({ status: 'ok' });
      });

      it('should allow POST /api/webhooks/anet without authentication', async () => {
        const response = await request(app)
          .post('/api/webhooks/anet')
          .expect(200);
        
        expect(response.body).toEqual({ webhook: 'anet' });
      });

      it('should allow POST /api/webhooks/rsr without authentication', async () => {
        const response = await request(app)
          .post('/api/webhooks/rsr')
          .expect(200);
        
        expect(response.body).toEqual({ webhook: 'rsr' });
      });

      it('should allow any /api/webhooks/* endpoint without authentication', async () => {
        const response = await request(app)
          .post('/api/webhooks/custom')
          .expect(200);
        
        expect(response.body).toEqual({ webhook: 'custom' });
      });

      it('should allow OPTIONS requests without authentication (CORS preflight)', async () => {
        await request(app)
          .options('/api/products')
          .expect(204);
      });
    });

    describe('Protected endpoints', () => {
      it('should reject requests without service key', async () => {
        const response = await request(app)
          .get('/api/products')
          .expect(401);
        
        expect(response.body).toEqual({
          error: 'Unauthorized',
          message: 'Service key required',
          header: 'X-Service-Key'
        });
      });

      it('should reject requests with wrong service key', async () => {
        const response = await request(app)
          .get('/api/products')
          .set('X-Service-Key', 'wrong-key')
          .expect(401);
        
        expect(response.body).toEqual({
          error: 'Unauthorized',
          message: 'Invalid service key'
        });
      });

      it('should allow requests with valid service key', async () => {
        const response = await request(app)
          .get('/api/products')
          .set('X-Service-Key', 'secret-key-456')
          .expect(200);
        
        expect(response.body).toEqual({ products: [] });
      });

      it('should work with lowercase header name', async () => {
        const response = await request(app)
          .get('/api/products')
          .set('x-service-key', 'secret-key-456')
          .expect(200);
        
        expect(response.body).toEqual({ products: [] });
      });
    });

    describe('Non-API routes', () => {
      it('should not apply to non-API routes', async () => {
        const response = await request(app)
          .get('/non-api/route')
          .expect(200);
        
        expect(response.body).toEqual({ route: 'non-api' });
      });
    });

    describe('Logging', () => {
      it('should log 401 attempts with anonymized IP', async () => {
        const consoleSpy = jest.spyOn(console, 'log');
        
        await request(app)
          .get('/api/products')
          .set('X-Forwarded-For', '192.168.1.100')
          .expect(401);
        
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('API Gate blocked')
        );
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('192.168.***.***')
        );
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Missing service key')
        );
        
        consoleSpy.mockRestore();
      });

      it('should not log the actual service key', async () => {
        const consoleSpy = jest.spyOn(console, 'log');
        
        await request(app)
          .get('/api/products')
          .set('X-Service-Key', 'wrong-key-that-should-not-be-logged')
          .expect(401);
        
        const logs = consoleSpy.mock.calls.map(call => call[0]);
        const hasKey = logs.some(log => 
          log.includes('wrong-key-that-should-not-be-logged')
        );
        
        expect(hasKey).toBe(false);
        
        consoleSpy.mockRestore();
      });
    });
  });

  describe('Custom header configuration', () => {
    it('should use custom header name from environment', async () => {
      const customApp = createTestApp({
        serviceKey: 'custom-key',
        headerName: 'X-Custom-Auth',
        enforceGate: true
      });
      
      // Should reject with default header
      await request(customApp)
        .get('/api/products')
        .set('X-Service-Key', 'custom-key')
        .expect(401);
      
      // Should accept with custom header
      const response = await request(customApp)
        .get('/api/products')
        .set('X-Custom-Auth', 'custom-key')
        .expect(200);
      
      expect(response.body).toEqual({ products: [] });
    });
  });

  describe('Edge cases', () => {
    it('should handle missing SERVICE_KEY when enforcement is enabled', async () => {
      const errorApp = createTestApp({
        serviceKey: '',
        enforceGate: true
      });
      
      const response = await request(errorApp)
        .get('/api/products')
        .expect(500);
      
      expect(response.body).toEqual({
        error: 'Internal Server Error',
        message: 'API authentication is misconfigured'
      });
    });

    it('should handle IPv6 addresses in anonymization', async () => {
      const consoleSpy = jest.spyOn(console, 'log');
      
      await request(app)
        .get('/api/products')
        .set('X-Forwarded-For', '2001:db8:85a3::8a2e:370:7334')
        .expect(401);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('2001:db8:****')
      );
      
      consoleSpy.mockRestore();
    });
  });
});

// Integration test with actual health endpoint
describe('Health Endpoint Integration', () => {
  let app: Application;
  const startTime = Date.now();
  
  beforeAll(() => {
    app = express();
    
    // Apply middleware with gate disabled
    process.env.ENFORCE_API_GATE = 'false';
    app.use(createApiGateMiddleware());
    
    // Add actual health endpoint
    app.get('/api/health', (req, res) => {
      const uptimeSec = Math.floor((Date.now() - startTime) / 1000);
      res.json({
        status: 'ok',
        uptimeSec,
        version: '1.0.0',
        time: new Date().toISOString()
      });
    });
  });

  it('should return proper health check response', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);
    
    expect(response.body).toMatchObject({
      status: 'ok',
      version: '1.0.0'
    });
    expect(response.body.uptimeSec).toBeGreaterThanOrEqual(0);
    expect(response.body.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});