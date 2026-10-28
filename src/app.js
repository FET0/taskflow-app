const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const pino = require('pino');
const pinoHttp = require('pino-http');
const rateLimit = require('express-rate-limit');
const client = require('prom-client');
const { Pool } = require('pg');
const Redis = require('ioredis');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 2,
  enableReadyCheck: true,
  lazyConnect: false
});

const metrics = new client.Registry();
client.collectDefaultMetrics({ register: metrics });
const httpRequests = new client.Counter({
  name: 'taskflow_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [metrics]
});
const httpDuration = new client.Histogram({
  name: 'taskflow_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [metrics]
});

function validateTask(body, partial = false) {
  const errors = [];
  if (!partial || body.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.trim().length < 1 || body.title.trim().length > 200) {
      errors.push('title must be a non-empty string up to 200 characters');
    }
  }
  if (body.description !== undefined && typeof body.description !== 'string') {
    errors.push('description must be a string');
  }
  if (body.status !== undefined && !['pending', 'in_progress', 'done'].includes(body.status)) {
    errors.push('status must be pending, in_progress, or done');
  }
  return errors;
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '32kb' }));
  app.use(rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
    max: Number(process.env.RATE_LIMIT_MAX || 60),
    standardHeaders: 'draft-7',
    legacyHeaders: false
  }));
  app.use(pinoHttp({ logger }));

  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const route = req.route?.path || req.path || 'unknown';
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      httpRequests.inc({ method: req.method, route, status_code: res.statusCode });
      httpDuration.observe({ method: req.method, route, status_code: res.statusCode }, seconds);
    });
    next();
  });

  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

  app.get('/readyz', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      await redis.ping();
      res.json({ status: 'ready', dependencies: { postgres: 'ok', redis: 'ok' } });
    } catch (err) {
      logger.warn({ err }, 'readiness check failed');
      res.status(503).json({ status: 'not_ready' });
    }
  });

  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', metrics.contentType);
    res.end(await metrics.metrics());
  });

  app.get('/api/v1/tasks', async (req, res, next) => {
    try {
      const status = req.query.status;
      const page = Math.max(Number.parseInt(req.query.page || '1', 10), 1);
      const limit = Math.min(Math.max(Number.parseInt(req.query.limit || '20', 10), 1), 100);
      const offset = (page - 1) * limit;
      const cacheKey = `tasks:${status || 'all'}:${page}:${limit}`;
      const cached = await redis.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));

      const params = [];
      let where = '';
      if (status) {
        params.push(status);
        where = 'WHERE status = $1';
      }
      const countResult = await pool.query(`SELECT COUNT(*)::int AS count FROM tasks ${where}`, params);
      const listParams = status ? [status, limit, offset] : [limit, offset];
      const listSql = status
        ? 'SELECT id, title, description, status, created_at, updated_at FROM tasks WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3'
        : 'SELECT id, title, description, status, created_at, updated_at FROM tasks ORDER BY created_at DESC LIMIT $1 OFFSET $2';
      const result = await pool.query(listSql, listParams);
      const payload = {
        data: result.rows,
        pagination: { page, limit, total: countResult.rows[0].count }
      };
      await redis.set(cacheKey, JSON.stringify(payload), 'EX', Number(process.env.CACHE_TTL_SECONDS || 30));
      return res.json(payload);
    } catch (err) {
      return next(err);
    }
  });

  app.post('/api/v1/tasks', async (req, res, next) => {
    try {
      const errors = validateTask(req.body);
      if (errors.length) return res.status(400).json({ error: 'validation_error', details: errors });
      const result = await pool.query(
        'INSERT INTO tasks(title, description, status) VALUES($1, $2, $3) RETURNING *',
        [req.body.title.trim(), req.body.description || '', req.body.status || 'pending']
      );
      await redis.flushdb();
      return res.status(201).json(result.rows[0]);
    } catch (err) {
      return next(err);
    }
  });

  app.get('/api/v1/tasks/:id', async (req, res, next) => {
    try {
      const result = await pool.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
      if (!result.rows[0]) return res.status(404).json({ error: 'not_found' });
      return res.json(result.rows[0]);
    } catch (err) {
      return next(err);
    }
  });

  app.patch('/api/v1/tasks/:id', async (req, res, next) => {
    try {
      const errors = validateTask(req.body, true);
      if (errors.length) return res.status(400).json({ error: 'validation_error', details: errors });
      const allowed = ['title', 'description', 'status'];
      const changes = Object.entries(req.body).filter(([key]) => allowed.includes(key));
      if (!changes.length) return res.status(400).json({ error: 'no_supported_fields' });
      const set = changes.map(([key], index) => `${key} = $${index + 1}`);
      const params = changes.map(([_, value]) => value);
      params.push(req.params.id);
      const result = await pool.query(
        `UPDATE tasks SET ${set.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
        params
      );
      if (!result.rows[0]) return res.status(404).json({ error: 'not_found' });
      await redis.flushdb();
      return res.json(result.rows[0]);
    } catch (err) {
      return next(err);
    }
  });

  app.delete('/api/v1/tasks/:id', async (req, res, next) => {
    try {
      const result = await pool.query('DELETE FROM tasks WHERE id = $1 RETURNING id', [req.params.id]);
      if (!result.rows[0]) return res.status(404).json({ error: 'not_found' });
      await redis.flushdb();
      return res.status(204).send();
    } catch (err) {
      return next(err);
    }
  });

  app.use((err, _req, res, _next) => {
    logger.error({ err }, 'request failed');
    res.status(500).json({ error: 'internal_server_error' });
  });

  return app;
}

module.exports = { createApp, pool, redis, validateTask };
