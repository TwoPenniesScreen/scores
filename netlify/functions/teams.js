// Netlify Function: /.netlify/functions/teams
// Compatibility alias: returns same as /scores

const scores = require("./scores.js");

exports.handler = async (event, context) => {
  return scores.handler(event, context);
};
