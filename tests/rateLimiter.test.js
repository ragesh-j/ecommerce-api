import express from 'express';
import request from 'supertest';
import { createLimiter } from '../src/middlewares/rateLimiter.js';
import { errorHandler } from '../src/middlewares/errorHandler.js';

const buildApp = () => {
  const app = express();
  app.use(
    createLimiter({
      windowMs: 60_000,
      limit: 2,
      message: 'Too many requests',
      skip: () => false, // override the test-env skip
    })
  );
  app.get('/ping', (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
};

describe('rate limiter', () => {
  it('allows requests under the limit and returns 429 over it', async () => {
    const app = buildApp();
    expect((await request(app).get('/ping')).status).toBe(200);
    expect((await request(app).get('/ping')).status).toBe(200);

    const res = await request(app).get('/ping');
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ success: false, message: 'Too many requests' });
    expect(res.headers['retry-after']).toBeDefined();
  });
});