'use strict';

const crypto = require('node:crypto');

const ROLE_PERMISSIONS = Object.freeze({
  reader: Object.freeze(['read']),
  developer: Object.freeze(['read', 'write']),
  admin: Object.freeze(['read', 'write', 'admin']),
});

function loadTokens(value = process.env.AGENT_API_TOKENS) {
  if (!value) {
    throw new Error('AGENT_API_TOKENS must contain a JSON array of token/role entries');
  }

  let tokens;
  try {
    tokens = JSON.parse(value);
  } catch {
    throw new Error('AGENT_API_TOKENS must be valid JSON');
  }

  return tokens;
}

function validateTokens(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    throw new Error('At least one API token must be configured');
  }

  const seen = new Set();
  return tokens.map((entry, index) => {
    if (!entry || typeof entry.token !== 'string' || entry.token.length < 16) {
      throw new Error(`Token entry ${index} must contain a token of at least 16 characters`);
    }
    if (!Object.hasOwn(ROLE_PERMISSIONS, entry.role)) {
      throw new Error(`Token entry ${index} has an unsupported role`);
    }
    if (seen.has(entry.token)) {
      throw new Error(`Token entry ${index} duplicates an existing token`);
    }
    seen.add(entry.token);
    return Object.freeze({ token: entry.token, role: entry.role });
  });
}

function readBearerToken(request) {
  const value = request?.headers?.authorization;
  if (typeof value !== 'string') return null;
  const match = /^Bearer ([^\s]+)$/i.exec(value);
  return match ? match[1] : null;
}

function respond(response, status, message) {
  const body = { error: message };
  if (typeof response.status === 'function' && typeof response.json === 'function') {
    response.status(status).json(body);
    return;
  }

  response.statusCode = status;
  if (typeof response.setHeader === 'function') {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (status === 401) response.setHeader('WWW-Authenticate', 'Bearer');
  }
  response.end(JSON.stringify(body));
}

function createAuthorization(options = {}) {
  const tokens = validateTokens(options.tokens || loadTokens());

  function authenticate(request, response, next) {
    const supplied = readBearerToken(request);
    let role = null;

    if (supplied) {
      const suppliedBytes = Buffer.from(supplied);
      for (const entry of tokens) {
        const expectedBytes = Buffer.from(entry.token);
        const sameLength = suppliedBytes.length === expectedBytes.length;
        const matches = sameLength && crypto.timingSafeEqual(suppliedBytes, expectedBytes);
        if (matches) role = entry.role;
      }
    }

    if (!role) {
      respond(response, 401, 'Valid bearer token required');
      return;
    }

    request.auth = Object.freeze({ role });
    next();
  }

  function authorize(...allowedRoles) {
    if (allowedRoles.length === 0 || allowedRoles.some((role) => !Object.hasOwn(ROLE_PERMISSIONS, role))) {
      throw new Error('authorize() requires one or more supported roles');
    }

    return function authorizeRequest(request, response, next) {
      if (!request?.auth?.role) {
        respond(response, 401, 'Authentication required');
        return;
      }
      if (!allowedRoles.includes(request.auth.role)) {
        respond(response, 403, 'Insufficient permissions');
        return;
      }
      next();
    };
  }

  function authorizePermission(permission) {
    const roles = Object.entries(ROLE_PERMISSIONS)
      .filter(([, permissions]) => permissions.includes(permission))
      .map(([role]) => role);
    if (roles.length === 0) throw new Error(`Unsupported permission: ${permission}`);
    return authorize(...roles);
  }

  return Object.freeze({ authenticate, authorize, authorizePermission });
}

module.exports = { createAuthorization, loadTokens, ROLE_PERMISSIONS };
