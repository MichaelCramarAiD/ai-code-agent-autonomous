'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthorization, loadTokens } = require('../src/auth/authorization');

const credentials = [
  { token: 'reader-token-0123456789', role: 'reader' },
  { token: 'admin-token-0123456789', role: 'admin' },
];

function responseRecorder() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = JSON.parse(body); },
  };
}

test('authentication rejects missing and invalid bearer tokens', () => {
  const { authenticate } = createAuthorization({ tokens: credentials });
  for (const authorization of [undefined, 'Basic abc', 'Bearer wrong-token-012345']) {
    const response = responseRecorder();
    let called = false;
    authenticate({ headers: { authorization } }, response, () => { called = true; });
    assert.equal(called, false);
    assert.equal(response.statusCode, 401);
    assert.equal(response.headers['WWW-Authenticate'], 'Bearer');
  }
});

test('authentication attaches trusted role and role authorization gates access', () => {
  const auth = createAuthorization({ tokens: credentials });
  const request = { headers: { authorization: `Bearer ${credentials[0].token}` } };
  let authenticated = false;
  auth.authenticate(request, responseRecorder(), () => { authenticated = true; });
  assert.equal(authenticated, true);
  assert.deepEqual(request.auth, { role: 'reader' });

  const response = responseRecorder();
  let authorized = false;
  auth.authorize('admin')(request, response, () => { authorized = true; });
  assert.equal(authorized, false);
  assert.equal(response.statusCode, 403);

  auth.authorizePermission('read')(request, responseRecorder(), () => { authorized = true; });
  assert.equal(authorized, true);
});

test('authorization configuration fails closed for missing or malformed tokens', () => {
  assert.throws(() => createAuthorization({ tokens: [] }), /At least one API token/);
  assert.throws(() => loadTokens('{bad json'), /valid JSON/);
  assert.throws(() => createAuthorization({ tokens: [{ token: 'short', role: 'admin' }] }), /at least 16 characters/);
  assert.throws(() => createAuthorization({ tokens: [{ token: 'long-enough-token', role: 'owner' }] }), /unsupported role/);
});
