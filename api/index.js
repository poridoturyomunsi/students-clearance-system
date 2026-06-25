/**
 * Vercel Serverless Function Entrypoint
 * Routes incoming API requests to the shared Express backend.
 */
const { app } = require('../electron/server.js');

module.exports = app;
