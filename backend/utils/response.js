/**
 * Standardised API response helpers.
 * All API responses follow the shape:
 *   { success: boolean, message: string, data?: any, meta?: any }
 */

function success(res, data = null, message = 'Success', statusCode = 200, meta = null) {
  const body = { success: true, message };
  if (data !== null) body.data = data;
  if (meta !== null) body.meta = meta;
  return res.status(statusCode).json(body);
}

function created(res, data = null, message = 'Created') {
  return success(res, data, message, 201);
}

function error(res, message = 'Something went wrong', statusCode = 500, errors = null) {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(statusCode).json(body);
}

function notFound(res, message = 'Resource not found') {
  return error(res, message, 404);
}

function unauthorized(res, message = 'Unauthorized') {
  return error(res, message, 401);
}

function forbidden(res, message = 'Forbidden') {
  return error(res, message, 403);
}

function badRequest(res, message = 'Bad request', errors = null) {
  return error(res, message, 400, errors);
}

function paginate(res, data, { page, limit, total }, message = 'Success') {
  return success(res, data, message, 200, {
    page:        Number(page),
    limit:       Number(limit),
    total,
    totalPages:  Math.ceil(total / limit),
    hasNextPage: page * limit < total,
    hasPrevPage: page > 1,
  });
}

module.exports = { success, created, error, notFound, unauthorized, forbidden, badRequest, paginate };
