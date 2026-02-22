import express from "express";
import fetch from "node-fetch";

const router = express.Router();

const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

/**
 * GET /auth/status
 * Check whether user is logged in and return GitHub profile
 */
router.get("/status", async (req, res) => {
  const token = req.cookies.github_token;

  if (!token) {
    return res.json({ loggedIn: false });
  }

  try {
    const ghRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "MCP-Orchestrator",
      },
    });

    if (ghRes.status === 401 || ghRes.status === 403) {
      res.clearCookie("github_token");
      return res.json({ loggedIn: false });
    }

    const user = await ghRes.json();

    return res.json({
      loggedIn: true,
      login: user.login,
      name: user.name,
      avatar_url: user.avatar_url,
      id: user.id,
    });
  } catch (err) {
    console.error("/auth/status error:", err);
    return res.status(500).json({ loggedIn: false });
  }
});

/**
 * GET /auth/callback
 * GitHub OAuth callback
 */
router.get("/callback", async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.status(400).json({ error: "Missing code" });
  }

  try {
    const tokenRes = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code,
        }),
      }
    );

    const data = await tokenRes.json();
    const token = data.access_token;

    if (!token) {
      return res.status(400).json({ error: "Invalid OAuth code" });
    }

    res.cookie("github_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false, // true in production (HTTPS)
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.redirect(`${FRONTEND_URL}?authed=1`);
  } catch (err) {
    console.error("/auth/callback error:", err);
    return res.status(500).json({ error: "OAuth failed" });
  }
});

/**
 * POST /auth/logout
 * Logout user and revoke GitHub token
 */
router.post("/logout", async (req, res) => {
  const token = req.cookies.github_token;

  // Clear cookie always
  res.clearCookie("github_token");

  if (!token) {
    return res.json({ ok: true });
  }

  try {
    const basicAuth = Buffer.from(
      `${CLIENT_ID}:${CLIENT_SECRET}`
    ).toString("base64");

    await fetch(
      `https://api.github.com/applications/${CLIENT_ID}/grant`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "MCP-Orchestrator",
        },
        body: JSON.stringify({ access_token: token }),
      }
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("/auth/logout error:", err);
    return res.json({ ok: true }); // still OK for frontend
  }
});

export default router;
