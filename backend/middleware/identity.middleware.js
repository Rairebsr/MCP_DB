// backend/middleware/identity.middleware.js

export default function identityMiddleware(req, res, next) {
  const userId = req.headers["x-user-id"];
  const sessionId = req.headers["x-session-id"];

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: "Missing user identity"
    });
  }

  req.userId = userId;
  req.sessionId = sessionId || null;

  next();
}
