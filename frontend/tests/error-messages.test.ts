import { describe, expect, it, vi } from 'vitest';

import { errorMessage, mapToFieldError, retryAfterSeconds } from '@/lib/error-messages';

describe('errorMessage', () => {
  it.each([
    ['INVALID_CREDENTIALS', /email or password is incorrect/i],
    ['EMAIL_EXISTS', /account.*already exists/i],
    ['RATE_LIMITED', /too many attempts/i],
    ['VALIDATION_ERROR', /some fields are invalid/i],
    ['NETWORK_ERROR', /can't reach the server/i],
    ['CONFLICT', /conflicts with an existing/i],
  ])('returns the documented copy for %s', (code, match) => {
    expect(errorMessage({ code, message: 'raw' })).toMatch(match);
  });

  it('falls back to the generic INTERNAL_ERROR copy for unknown codes', () => {
    expect(errorMessage({ code: 'NOT_A_REAL_CODE', message: 'x' })).toMatch(
      /went wrong on our end/i,
    );
  });

  it('returns the fallback when no error is provided', () => {
    expect(errorMessage(undefined)).toMatch(/went wrong on our end/i);
  });
});

describe('retryAfterSeconds', () => {
  it('extracts a numeric retryAfter from details', () => {
    expect(
      retryAfterSeconds({ code: 'RATE_LIMITED', message: '', details: { retryAfter: 42 } }),
    ).toBe(42);
  });

  it('returns null when details are missing or malformed', () => {
    expect(retryAfterSeconds({ code: 'RATE_LIMITED', message: '' })).toBeNull();
    expect(
      retryAfterSeconds({ code: 'RATE_LIMITED', message: '', details: { other: true } }),
    ).toBeNull();
  });
});

describe('mapToFieldError', () => {
  it('calls setError and returns true when the code is mapped', () => {
    const setError = vi.fn();
    const handled = mapToFieldError({ code: 'EMAIL_EXISTS', message: '' }, setError, {
      EMAIL_EXISTS: { field: 'email', message: 'Taken' },
    });
    expect(handled).toBe(true);
    expect(setError).toHaveBeenCalledWith('email', { message: 'Taken' });
  });

  it('returns false and does nothing when the code is not mapped', () => {
    const setError = vi.fn();
    const handled = mapToFieldError({ code: 'INTERNAL_ERROR', message: '' }, setError, {
      EMAIL_EXISTS: { field: 'email', message: 'Taken' },
    });
    expect(handled).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });
});
