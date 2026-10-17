export { ForbiddenError } from './authorization';

export class BadRequestError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

export class UnauthorizedError extends Error {
  readonly statusCode = 401;
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class NotFoundError extends Error {
  readonly statusCode = 404;
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  readonly statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}
