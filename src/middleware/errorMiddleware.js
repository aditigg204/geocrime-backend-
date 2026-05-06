const { fail } = require('../utils/response');
function notFound(req, res) { return fail(res, `Route not found: ${req.method} ${req.originalUrl}`, 404); }
function errorHandler(err, req, res, next) {
  console.error(err);
  const status = err.status || 500;
  return fail(res, err.message || 'Internal server error', status, err.details || null);
}
module.exports = { notFound, errorHandler };
