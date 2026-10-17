const test = require('node:test');
const assert = require('node:assert/strict');
const { getBrowserUploadCorsConfiguration } = require('../src/services/storageService');

test('browser upload CORS allows PUT with content-type from any origin', () => {
  const [rule] = getBrowserUploadCorsConfiguration().CORSRules;
  assert.deepEqual(rule.AllowedOrigins, ['*']);
  assert.deepEqual(rule.AllowedMethods, ['GET', 'PUT', 'HEAD']);
  assert.deepEqual(rule.AllowedHeaders, ['content-type']);
});
