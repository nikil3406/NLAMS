import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AuthenticationError } from '../services/auth';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../types';

export function handleApiError(error: unknown): NextResponse {
  if (
    error instanceof AuthenticationError ||
    (error as { name?: string }).name === 'AuthenticationError'
  ) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 401 }
    );
  }

  if (
    error instanceof ForbiddenError ||
    (error as { name?: string }).name === 'ForbiddenError'
  ) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 403 }
    );
  }

  if (
    error instanceof NotFoundError ||
    (error as { name?: string }).name === 'NotFoundError'
  ) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 404 }
    );
  }

  if (
    error instanceof ConflictError ||
    (error as { name?: string }).name === 'ConflictError'
  ) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 409 }
    );
  }

  if (
    error instanceof BadRequestError ||
    (error as { name?: string }).name === 'BadRequestError'
  ) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 400 }
    );
  }

  if (
    error instanceof ZodError ||
    (error as { name?: string }).name === 'ZodError'
  ) {
    const issue = (error as ZodError).issues?.[0];
    return NextResponse.json(
      {
        success: false,
        error: issue?.message ?? 'Validation failed',
        issues: (error as ZodError).issues,
      },
      { status: 400 }
    );
  }

  return NextResponse.json(
    { success: false, error: 'An unexpected error occurred' },
    { status: 500 }
  );
}
