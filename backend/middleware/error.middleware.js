// backend/middleware/error.middleware.js

export default function errorHandler(err, req, res, next) {
  console.error("🔥 Backend Error:", err);

  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Internal server error"
  });
}
