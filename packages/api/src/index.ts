import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { serve } from '@hono/node-server';
import { stripRoute } from './routes/strip.js';
import { inspectRoute } from './routes/inspect.js';

const app = new Hono();

// CORS — restrict origin before production deployment
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['*'];
app.use('*', cors({ origin: allowedOrigins }));

// Body size limit: 50MB (matches route-level validation)
app.use('*', bodyLimit({ maxSize: 50 * 1024 * 1024 }));

// Health check
app.get('/', (c) => c.json({
  name: 'MetaStrip API',
  version: '0.1.0',
  docs: 'https://metastrip.ai/docs#api',
}));

app.get('/health', (c) => c.json({ status: 'ok' }));

// API routes
app.route('/v1', stripRoute);
app.route('/v1', inspectRoute);

// 404
app.notFound((c) => c.json({ error: 'Not found' }, 404));

// Error handler
app.onError((err, c) => {
  console.error('API Error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

const port = parseInt(process.env.PORT || '3001');
console.log(`MetaStrip API running on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
