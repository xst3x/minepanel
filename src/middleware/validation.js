// src/middleware/validation.js
// Validation middleware using Joi.
// validate(schema)      — validates req.body
// validateQuery(schema) — validates req.query

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

function validateQuery(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, { abortEarly: false, allowUnknown: false });
    if (error) {
      return sendError(res, E.VALIDATION_ERROR, 400, error.details.map(d => d.message).join('; '));
    }
    req.query = value;
    next();
  };
}

module.exports = { validate, validateQuery };
