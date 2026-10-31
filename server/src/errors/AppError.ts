export type ErrorFields = Record<string, string>;

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly fields?: ErrorFields;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_SERVER_ERROR', fields?: ErrorFields) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.fields = fields;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Please fix the highlighted fields.', fields?: ErrorFields) {
    super(message, 400, 'VALIDATION_ERROR', fields);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required.') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action.') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found.') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'A conflict occurred with existing data.', fields?: ErrorFields) {
    super(message, 409, 'CONFLICT', fields);
  }
}

export class BusinessRuleError extends AppError {
  constructor(message: string, fields?: ErrorFields) {
    super(message, 422, 'BUSINESS_RULE_ERROR', fields);
  }
}
