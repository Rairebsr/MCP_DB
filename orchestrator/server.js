import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
import "dotenv/config"; // Load .env
import connectDB from "../backend/config/db.js";
import rateLimit from "express-rate-limit";
import askRoute from "./src/routes/ask.route.js";
import authRoute from "./src/routes/auth.route.js";
import fileRoute from  "./src/routes/file.route.js"
import sessionMiddleware from "./src/middleware/session.js";

const app = express();

app.use(cors({
  origin: "http://localhost:5173",
  credentials: true,
}));
connectDB();
app.use(cookieParser());
app.use(bodyParser.json());
app.use(sessionMiddleware);

const askLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 4,               // max 4 requests per minute per session/IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    reply: "⏳ Please wait before sending another message."
  }
});

// 🔥 APPLY ONLY TO /ask
app.use("/ask", askLimiter);

app.use("/ask", askRoute);
app.use("/auth", authRoute);
app.use("/file", fileRoute);

app.get("/test", (_, res) => res.send("🤖 Orchestrator running"));

app.listen(4000, () => {
  console.log("🚀 Orchestrator running on port 4000");
});
