// Compatibility alias: /.netlify/functions/teams
// Returns the same as /scores so old URLs don't break.
const scores = require("./scores.js");
exports.handler = scores.handler;
