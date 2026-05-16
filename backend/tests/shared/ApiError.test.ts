import { ApiError, ErrorCode, isApiError } from '../../src/shared/errors';

describe('ApiError', () => {
  it('produces the spec envelope on toJSON()', () => {
    const e = ApiError.validation('bad', { field: 'name' });
    expect(e.toJSON()).toEqual({
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'bad',
        details: { field: 'name' },
      },
    });
  });

  it('omits details when undefined', () => {
    const e = ApiError.notFound('gone');
    expect(e.toJSON()).toEqual({
      error: { code: ErrorCode.NOT_FOUND, message: 'gone' },
    });
  });

  it('isApiError discriminates correctly', () => {
    expect(isApiError(ApiError.forbidden())).toBe(true);
    expect(isApiError(new Error('plain'))).toBe(false);
    expect(isApiError(null)).toBe(false);
  });

  it('static helpers map to correct status codes', () => {
    expect(ApiError.unauthorized().statusCode).toBe(401);
    expect(ApiError.forbidden().statusCode).toBe(403);
    expect(ApiError.notFound().statusCode).toBe(404);
    expect(ApiError.conflict().statusCode).toBe(409);
    expect(ApiError.invalidState().statusCode).toBe(409);
    expect(ApiError.validation().statusCode).toBe(422);
    expect(ApiError.rateLimited().statusCode).toBe(429);
    expect(ApiError.internal().statusCode).toBe(500);
  });
});
