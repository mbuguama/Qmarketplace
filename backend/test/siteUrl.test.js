const test = require('node:test');
const assert = require('node:assert/strict');
const { getPublicSiteOrigin, getPublicSiteOrigins } = require('../src/utils/siteUrl');

const environmentKeys = [
  'FRONTEND_URL',
  'VERCEL',
  'VERCEL_PROJECT_PRODUCTION_URL',
  'VERCEL_URL'
];

function withEnvironment(values, callback) {
  const previous = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  environmentKeys.forEach((key) => {
    if (key in values) process.env[key] = values[key];
    else delete process.env[key];
  });
  try {
    callback();
  } finally {
    environmentKeys.forEach((key) => {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    });
  }
}

test('uses the configured public origin outside Vercel', () => {
  withEnvironment({ FRONTEND_URL: 'https://www.example.com/path' }, () => {
    assert.equal(getPublicSiteOrigin(), 'https://www.example.com');
  });
});

test('ignores a localhost frontend URL on Vercel', () => {
  withEnvironment({
    FRONTEND_URL: 'http://localhost:4000',
    VERCEL: '1',
    VERCEL_PROJECT_PRODUCTION_URL: 'qmarketplace.vercel.app',
    VERCEL_URL: 'qmarketplace-git-main.vercel.app'
  }, () => {
    assert.equal(getPublicSiteOrigin(), 'https://qmarketplace.vercel.app');
    assert.deepEqual(getPublicSiteOrigins(), [
      'https://qmarketplace.vercel.app',
      'https://qmarketplace-git-main.vercel.app'
    ]);
  });
});

test('prefers a configured custom origin over Vercel hostnames', () => {
  withEnvironment({
    FRONTEND_URL: 'https://market.example.com',
    VERCEL: '1',
    VERCEL_PROJECT_PRODUCTION_URL: 'qmarketplace.vercel.app'
  }, () => {
    assert.equal(getPublicSiteOrigin(), 'https://market.example.com');
  });
});

test('rejects unsupported site URL protocols', () => {
  withEnvironment({ FRONTEND_URL: 'ftp://example.com' }, () => {
    assert.throws(() => getPublicSiteOrigin(), /HTTP\(S\) origin/);
  });
});
