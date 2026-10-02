/**
 * Content Security Policy strings shared between:
 *  - the Vite `transformIndexHtml` plugin (meta tag, covers packaged file:// loads)
 *  - the Electron main process `onHeadersReceived` hook (covers the dev server)
 * Both consumers must always use the same string for the same mode.
 */
export const DEV_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  'connect-src \'self\' ws://localhost:5173 http://localhost:5173',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

export const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

export const DEV_SERVER_ORIGIN = 'http://localhost:5173';
