// Compatibility alias: /.netlify/functions/teams
// Returns same payload as scores so old URLs don't break.
exports.handler = async (event, context) => {
  const scores = require("./scores.js");
  return scores.handler(event, context);
};
