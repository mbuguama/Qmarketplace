const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../src/app');

function startServer(appInstance) {
  return new Promise((resolve) => {
    const server = http.createServer(appInstance);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((res) => server.close(res))
      });
    });
  });
}

test('serves robots.txt at /robots.txt with sitemap reference', async () => {
  const { url, close } = await startServer(app);
  try {
    const response = await fetch(`${url}/robots.txt`);
    assert.equal(response.status, 200);
    const contentType = response.headers.get('content-type');
    assert.ok(contentType.includes('text/plain'));
    const body = await response.text();
    assert.ok(body.includes('User-agent: *'));
    assert.ok(body.includes('Sitemap: '));
  } finally {
    await close();
  }
});

test('serves sitemap.xml at /sitemap.xml with valid xml content', async () => {
  const { url, close } = await startServer(app);
  try {
    const response = await fetch(`${url}/sitemap.xml`);
    assert.equal(response.status, 200);
    const contentType = response.headers.get('content-type');
    assert.ok(contentType.includes('application/xml'));
    const body = await response.text();
    assert.ok(body.includes('<urlset'));
    assert.ok(body.includes('<loc>'));
  } finally {
    await close();
  }
});

test('also serves robots.txt at /api/robots.txt for backwards compatibility', async () => {
  const { url, close } = await startServer(app);
  try {
    const response = await fetch(`${url}/api/robots.txt`);
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.ok(body.includes('User-agent: *'));
  } finally {
    await close();
  }
});

test('also serves sitemap.xml at /api/sitemap.xml for backwards compatibility', async () => {
  const { url, close } = await startServer(app);
  try {
    const response = await fetch(`${url}/api/sitemap.xml`);
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.ok(body.includes('<urlset'));
  } finally {
    await close();
  }
});
