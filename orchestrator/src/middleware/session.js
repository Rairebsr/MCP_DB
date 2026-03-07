import { v4 as uuidv4 } from "uuid";


const sessionMemory = {}; 

export default async function sessionMiddleware(req, res, next) {
  let sessionId = req.cookies.session_id;

  // 1️⃣ Create session if missing
  if (!sessionId) {
    sessionId = Math.random().toString(36).substring(2);
    res.cookie("session_id", sessionId, {
      sameSite: "lax",
      secure: false,
      httpOnly: true // Good practice for security
    });
  }

  req.sessionId = sessionId;

  // 2️⃣ Use GitHub identity if available, otherwise fallback to memory
  const githubToken = req.cookies.github_token;

  if (githubToken && (!sessionMemory[sessionId] || sessionMemory[sessionId].isAnonymous)) {
    try {
      const response = await fetch("https://api.github.com/user", {
        headers: { Authorization: `token ${githubToken}` }
      });
      const githubUser = await response.json();
      
      sessionMemory[sessionId] = {
        userId: githubUser.login, // Persistence: now matches "new21ray"
        isAnonymous: false
      };
    } catch (err) {
      console.error("Failed to fetch GitHub identity:", err);
    }
  }

  // 3️⃣ Create a temporary record if still missing (first-time landing)
  if (!sessionMemory[sessionId]) {
    sessionMemory[sessionId] = {
      userId: uuidv4(),
      isAnonymous: true
    };
  }

  // 4️⃣ Attach the stable ID to the request
  req.userId = sessionMemory[sessionId].userId;

  next();
}