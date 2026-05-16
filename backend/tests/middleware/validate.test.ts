import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { validate } from '../../src/middleware/validate';
import { errorHandler } from '../../src/middleware/errorHandler';
import { requestId } from '../../src/middleware/requestId';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(requestId);
  app.post(
    '/echo',
    validate({ body: z.object({ name: z.string().min(2) }) }),
    (req, res) => res.json({ name: req.body.name }),
  );
  app.use(errorHandler);
  return app;
}

describe('validate middleware', () => {
  const app = makeApp();

  it('passes through valid payloads and replaces req.body with parsed shape', async () => {
    const res = await request(app).post('/echo').send({ name: 'Hari' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: 'Hari' });
  });

  it('rejects invalid payloads with 422 and the spec envelope', async () => {
    const res = await request(app).post('/echo').send({ name: 'x' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toBeDefined();
    expect(res.body.requestId).toBeDefined();
  });
});
