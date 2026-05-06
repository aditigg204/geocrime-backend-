const { fail } = require('../utils/response');
function notFound(req, res) { return fail(res, `Route not found: ${req.method} ${req.originalUrl}`, 404, 'ROUTE_NOT_FOUND'); }
function errorHandler(err, req, res, next) {
  console.error(err);
  const status = err.status || 500;
  const message = status >= 500
    ? 'GeoCrime server could not complete this request. Please try again.'
    : err.message || 'Request failed';
  const errorCode = err.code || err.errorCode || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR');
  return fail(res, message, status, errorCode, err.details || null);
}
module.exports = { notFound, errorHandler };
