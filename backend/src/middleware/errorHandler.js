function notFoundHandler(req, res) {
  res.status(404).json({
    message: `Route not found: ${req.originalUrl}`
  });
}

function errorHandler(err, req, res, next) {
  console.error(err);
  if (res.headersSent) return next(err);
  const statusCode = Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode <= 599
    ? err.statusCode
    : 500;
  res.status(statusCode).json({
    message: statusCode < 500
      ? err.message
      : typeof err.publicMessage === 'string'
        ? err.publicMessage
        : statusCode === 503 && err.message
          ? err.message
          : 'Unexpected server error.'
  });
}

module.exports = { notFoundHandler, errorHandler };
