const sessionMemory = {};

export default function sessionMiddleware(req, res, next) {
  if (!req.cookies.session_id) {
    const id = Math.random().toString(36).substring(2);
    res.cookie("session_id", id, {
      sameSite: "lax",
      secure: false
    });
    req.sessionId = id;
  } else {
    req.sessionId = req.cookies.session_id;
  }

  if (!sessionMemory[req.sessionId]) {
    sessionMemory[req.sessionId] = true;
  }

  next();
}
