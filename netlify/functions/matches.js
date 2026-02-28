/**
 * Netlify Function: /.netlify/functions/matches
 *
 * Compatibility alias for older clients.
 * Delegates to the existing `scores` function without changing payload/UI.
 */
const scores = require("./scores.js");
exports.handler = scores.handler;
