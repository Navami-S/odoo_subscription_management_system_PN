import { Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError.js';
import { logger } from '../utils/logger.js';

export const errorMiddleware: ErrorRequestHandler = (
  err: any,
  req: any,
  res: Response,
  _next: NextFunction
): void => {
  const requestId =
    (req.id ? String(req.id) : null) ||
    (req.headers['x-request-id'] as string) ||
    Math.random().toString(36).substring(2, 8);

  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected error occurred. Please try again later.';
  let fields: Record<string, string> | undefined;

  // 1. Handled AppError
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    fields = err.fields;
  }
  // 2. Zod validation error
  else if (err instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Please fix the highlighted fields.';
    fields = {};
    for (const issue of err.issues) {
      const fieldName = issue.path.join('.') || 'root';
      fields[fieldName] = issue.message;
    }
  }
  // 3. Prisma error mapping
  else if (err?.code && typeof err.code === 'string' && err.code.startsWith('P')) {
    switch (err.code) {
      case 'P2002': {
        statusCode = 409;
        code = 'CONFLICT';
        const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : (err.meta?.target || 'field');
        if (target.includes('email')) {
          message = 'This email is already registered.';
          fields = { email: 'This email is already registered.' };
        } else {
          message = `A record with this ${target} already exists.`;
          fields = { [target]: `A record with this ${target} already exists.` };
        }
        break;
      }
      case 'P2003': {
        statusCode = 422;
        code = 'BUSINESS_RULE_ERROR';
        message = 'Referenced resource does not exist or is currently in use.';
        break;
      }
      case 'P2025': {
        statusCode = 404;
        code = 'NOT_FOUND';
        message = 'The requested resource was not found.';
        break;
      }
      default: {
        statusCode = 500;
        code = 'DATABASE_ERROR';
        message = 'A database error occurred.';
      }
    }
  }
  // 4. Raw MySQL numeric error codes
  else if (err?.errno) {
    switch (err.errno) {
      case 1062: // Duplicate entry
        statusCode = 409;
        code = 'CONFLICT';
        message = 'A duplicate entry already exists.';
        break;
      case 1452: // Cannot add or update child row: foreign key constraint fails
        statusCode = 422;
        code = 'BUSINESS_RULE_ERROR';
        message = 'Invalid reference: related record not found.';
        break;
      case 3819: // Check constraint violated
        statusCode = 422;
        code = 'BUSINESS_RULE_ERROR';
        message = 'Value violates database validation rules.';
        break;
      default:
        statusCode = 500;
        code = 'DATABASE_ERROR';
        message = 'A database error occurred.';
    }
  }

  // Log error with requestId (include stack trace only in logs, never in response)
  logger.error(
    {
      requestId,
      statusCode,
      code,
      message: err.message || message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
    },
    `Request error: ${message}`
  );

  const errorResponse: {
    error: {
      code: string;
      message: string;
      fields?: Record<string, string>;
      requestId: string;
    };
  } = {
    error: {
      code,
      message,
      requestId,
    },
  };

  if (fields && Object.keys(fields).length > 0) {
    errorResponse.error.fields = fields;
  }

  res.status(statusCode).json(errorResponse);
};
