import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { logger } from './shared/logger';
import { authenticate } from './middleware/auth';
import { errorHandler } from './middleware/error-handler';
import { healthRouter } from './modules/health';
import { identityRouter } from './modules/identity/routes';
import { contentRouter } from './modules/content/routes';
import { changelogRouter } from './modules/content/changelog';
import { contractRouter } from './modules/contract/routes';
import { exportRouter } from './modules/export/routes';
import { dlqRouter } from './modules/export/dlq-routes';
import { brandingRouter } from './modules/export/branding-routes';
import { batchExportRouter } from './modules/export/batch-routes';
import { logoUploadHandler } from './modules/export/logo-upload';
import { reviewerRouter } from './modules/content/reviewer';

const app = express();
const port = Number(process.env.PORT) || 3000;

const API_VERSION = '1.0.0';

// --- Global Middleware ---
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id', 'x-user-id', 'x-user-role'],
  credentials: true,
  maxAge: 86400,
}));
app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger }));

// --- API Version Header ---
app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-API-Version', API_VERSION);
  res.setHeader('X-Powered-By', 'Servanda Office');
  next();
});

// --- Health (no auth) ---
app.use('/api/health', healthRouter);
app.use('/api/v1/health', healthRouter);

// --- Authentication (JWT in prod, headers in dev) ---
app.use('/api', authenticate);
app.use('/api/v1', authenticate);

// --- Module Routes (v1 + legacy non-prefixed) ---
// v1 routes (canonical)
app.use('/api/v1/identity', identityRouter);
app.use('/api/v1/content', contentRouter);
app.use('/api/v1/content', changelogRouter);
app.use('/api/v1/content', reviewerRouter);
app.use('/api/v1/contracts', contractRouter);
app.use('/api/v1/export-jobs', exportRouter);
app.use('/api/v1/export-jobs', dlqRouter);
app.use('/api/v1/export-jobs', batchExportRouter);
app.use('/api/v1/export', brandingRouter);
app.post('/api/v1/export/branding/style-templates/:id/logo', logoUploadHandler);

// Legacy routes (backward-compatible, same handlers)
app.use('/api/identity', identityRouter);
app.use('/api/content', contentRouter);
app.use('/api/content', changelogRouter);
app.use('/api/content', reviewerRouter);
app.use('/api/contracts', contractRouter);
app.use('/api/export-jobs', exportRouter);
app.use('/api/export-jobs', dlqRouter);
app.use('/api/export-jobs', batchExportRouter);
app.use('/api/export', brandingRouter);
app.post('/api/export/branding/style-templates/:id/logo', logoUploadHandler);

// --- Error Handler ---
app.use(errorHandler);

app.listen(port, () => {
  logger.info({ port, apiVersion: API_VERSION }, `Servanda Office API v${API_VERSION} listening on port ${port}`);
});

export { app, API_VERSION };
