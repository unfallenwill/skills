#!/usr/bin/env node
/**
 * Fixture service for the verify eval suite.
 *
 * It exists to make the eval meaningful, not to be realistic:
 *
 *   1. Its OpenAPI document carries DELIBERATELY WRONG example responses
 *      (`WRONG-EXAMPLE-SKU`, `total: 99`). An agent that copies expectations out of
 *      the document tests the service against itself and fails the run. The
 *      expectations have to come from the requirement.
 *   2. It drops the `price` field when a create omits it, instead of rejecting the
 *      request. A requirement that says "price is required" is therefore genuinely
 *      unmet, and the report has to say so.
 *
 * Usage: node service.js [port]     (default 8801)
 */

'use strict';

const http = require('http');

const port = Number(process.argv[2] || 8801);

const products = new Map();

const spec = {
  openapi: '3.0.0',
  info: { title: 'fixture', version: '1' },
  paths: {
    '/healthz': { get: { responses: { 200: { description: 'ok' } } } },
    '/api/products': {
      post: {
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  sku: { type: 'string' },
                  name: { type: 'string' },
                  price: { type: 'string' },
                },
                required: ['sku', 'name'],
              },
            },
          },
        },
        responses: {
          201: {
            description: 'created',
            content: {
              'application/json': {
                // Wrong on purpose. The real response echoes what was posted.
                example: { sku: 'WRONG-EXAMPLE-SKU', name: 'WRONG-EXAMPLE-NAME', price: '0.01' },
              },
            },
          },
          409: { description: 'duplicate' },
        },
      },
      get: {
        parameters: [{ name: 'min_price', in: 'query', schema: { type: 'number' } }],
        responses: {
          200: {
            description: 'list',
            content: {
              'application/json': {
                // Wrong on purpose.
                example: { total: 99, items: [] },
              },
            },
          },
        },
      },
    },
    '/api/products/{sku}': {
      get: {
        parameters: [{ name: 'sku', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'one' }, 404: { description: 'missing' } },
      },
    },
  },
  components: {
    schemas: {
      Product: {
        type: 'object',
        properties: {
          sku: { type: 'string' },
          name: { type: 'string' },
          price: { type: 'string' },
        },
      },
    },
  },
};

function send(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://fixture');

    if (url.pathname === '/openapi.json') return send(res, 200, spec);
    if (url.pathname === '/healthz') return send(res, 200, { ok: true });

    if (url.pathname === '/api/products' && req.method === 'POST') {
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk;
      });
      return req.on('end', () => {
        let body;
        try {
          body = JSON.parse(raw || '{}');
        } catch (error) {
          return send(res, 400, { detail: 'not JSON' });
        }
        if (!body.sku || !body.name) {
          return send(res, 422, { detail: 'sku and name are required' });
        }
        if (products.has(body.sku)) {
          return send(res, 409, { detail: 'duplicate sku' });
        }
        // `price` is not required, and a missing price is dropped instead of
        // rejected - the defect the second eval case looks for.
        products.set(body.sku, body);
        return send(res, 201, products.get(body.sku));
      });
    }

    if (url.pathname === '/api/products' && req.method === 'GET') {
      const minPrice = url.searchParams.get('min_price');
      let list = [...products.values()];
      if (minPrice !== null) {
        list = list.filter((product) => Number(product.price) >= Number(minPrice));
      }
      return send(res, 200, { total: list.length, items: list });
    }

    const product = url.pathname.match(/^\/api\/products\/(.+)$/);
    if (product && req.method === 'GET') {
      const found = products.get(decodeURIComponent(product[1]));
      return found ? send(res, 200, found) : send(res, 404, { detail: 'not found' });
    }

    return send(res, 404, { detail: 'no route' });
  })
  .listen(port, '127.0.0.1', () => {
    process.stdout.write(`fixture listening on http://127.0.0.1:${port}\n`);
  });
