import path from 'node:path';
import { fileURLToPath } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext } from '../helpers.js';

const OPENAPI_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/openapi/openapi.yaml');
const ANY_ID = '6f1d3a52-3c1b-4a7e-9a55-0d2f7c9b1e10';
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

describe('documentation de l API', () => {
  let ctx;
  let spec;

  beforeAll(async () => {
    ctx = await createTestContext();
    // Valide le document selon la norme OpenAPI et résout les références entre fichiers.
    spec = await SwaggerParser.validate(OPENAPI_FILE);
  });
  afterAll(() => ctx.close());

  it('est un document OpenAPI valide qui décrit des routes', () => {
    expect(Object.keys(spec.paths).length).toBeGreaterThan(10);
  });

  it('chaque opération documentée existe vraiment dans l application', async () => {
    const operations = Object.entries(spec.paths).flatMap(([url, item]) =>
      METHODS.filter((method) => item[method]).map((method) => ({ url, method })),
    );
    for (const { url, method } of operations) {
      const concreteUrl = url.replace('{id}', ANY_ID).replace('{checkoutId}', 'sim_cs_x').replace('{action}', 'renew');
      const response = await request(ctx.app)[method](concreteUrl).send({});
      expect(response.body?.error?.code, `${method.toUpperCase()} ${url}`).not.toBe('route_introuvable');
    }
  });
});
