const errorHandler = (err, req, res, next) => {
  console.error('Error:', {
    name: err.name,
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method
  });

  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: {
        message: `Invalid ${err.path}: ${err.value}`,
        code: 400
      },
      timestamp: new Date().toISOString()
    });
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return res.status(409).json({
      success: false,
      error: {
        message: `${field} already exists`,
        code: 409
      },
      timestamp: new Date().toISOString()
    });
  }

  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(val => val.message);
    return res.status(400).json({
      success: false,
      error: {
        message: messages.join('. '),
        code: 400,
        details: messages
      },
      timestamp: new Date().toISOString()
    });
  }

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: {
      message: err.message || 'Internal server error',
      code: statusCode,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    },
    timestamp: new Date().toISOString()
  });
};

const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Can't find ${req.originalUrl} on this server!`,
      code: 404
    },
    timestamp: new Date().toISOString()
  });
};

const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400);
    this.name = 'ValidationError';
  }
}

class NotFoundError extends AppError {
  constructor(resource) {
    super(`${resource} not found`, 404);
    this.name = 'NotFoundError';
  }
}

class DuplicateError extends AppError {
  constructor(field) {
    super(`${field} already exists`, 409);
    this.name = 'DuplicateError';
  }
}

module.exports = {
  errorHandler,
  notFound,
  catchAsync,
  AppError,
  ValidationError,
  NotFoundError,
  DuplicateError
};