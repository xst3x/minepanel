// src/middleware/validation.js
// Simple validation middleware using Joi (or any schema validator).
// Usage: router.post('/example', validate(bodySchema), handler);

const Joi = require('joi');

function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false, allowUnknown: false });
    if (error) {
      return res.status(400).json({ error: 'Validation error', details: error.details.map(d => d.message) });
    }
    req.body = value; // sanitized
    next();
  };
}

module.exports = { validate };
