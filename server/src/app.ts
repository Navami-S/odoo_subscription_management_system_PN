import express, { RequestHandler } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { randomUUID } from 'crypto';
import { logger } from './utils/logger.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import { ValidationError, NotFoundError, BusinessRuleError } from './errors/AppError.js';
import { authRouter } from './routes/auth.routes.js';
import { userRouter } from './routes/user.routes.js';
import { catalogRouter } from './routes/catalog.routes.js';

export const app = express();

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);

// Parsers
app.use(express.json());
app.use(cookieParser());

// Request tracking & logging with pino-http
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => {
      const existingId = req.headers['x-request-id'];
      if (typeof existingId === 'string' && existingId) return existingId;
      return randomUUID().substring(0, 8);
    },
    customLogLevel: (_req, res, err) => {
      if (res.statusCode >= 500 || err) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  })
);

// Fallback requestId setter
const reqIdMiddleware: RequestHandler = (req, _res, next) => {
  if (!req.id) {
    req.id = (req.headers['x-request-id'] as string) || randomUUID().substring(0, 8);
  }
  next();
};
app.use(reqIdMiddleware);

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'brightloop-api',
    timestamp: new Date().toISOString(),
  });
});

// Authentication & User management routes
app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);

// Catalog routes (products, taxes, payment-terms, plans, discounts)
app.use('/api', catalogRouter);

// Test endpoints for verifying error handling structure
app.get('/api/test/validation-error', () => {
  throw new ValidationError('Please fix the highlighted fields.', {
    email: 'This email is already registered.',
  });
});

app.get('/api/test/business-rule-error', () => {
  throw new BusinessRuleError('Cannot move a subscription from Draft to Active. Confirm it first.');
});

// 404 handler for unknown routes
app.use((_req, _res, next) => {
  next(new NotFoundError('The requested endpoint does not exist.'));
});

// Central error middleware
app.use(errorMiddleware);
