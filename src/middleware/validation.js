// src/middleware/validation.js
// Simple validation middleware using Joi (or any schema validator).
// Usage: router.post('/example', validate(bodySchema), handler);

const Joi = require('joi');
const { E, sendError } = require('../core/errors');

function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false, allowUnknown: false });
    if (error) {
      return sendError(res, E.VALIDATION_ERROR, 400, error.details.map(d => d.message).join('; '));
    }
    req.body = value; // sanitized
    next();
  };
}

module.exports = { validate };
