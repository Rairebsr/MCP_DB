// backend/middleware/requestLogger.middleware.js

export default function requestLogger(req, res, next) {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
}
