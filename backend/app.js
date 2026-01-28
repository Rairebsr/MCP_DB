// backend/app.js

import express from "express";
import dotenv from "dotenv";
import connectDB from "./config/db.js";

import identityMiddleware from "./middleware/identity.middleware.js";
import requestLogger from "./middleware/requestLogger.middleware.js";
import errorHandler from "./middleware/error.middleware.js";

import actionRoutes from "./routes/actions.routes.js";

dotenv.config();

const app = express();

app.use(express.json());

// 🔌 Connect DB
connectDB();

// 🪪 Identity comes FIRST
app.use(identityMiddleware);

// 🪵 Optional logger
app.use(requestLogger);

app.use((req, res, next) => {
  const userId = req.headers["x-user-id"];

  if (!userId) {
    return res.status(401).json({ error: "Missing user identity" });
  }

  req.userId = userId;
  next();
});


// 🛣️ Routes
app.use("/api/actions", actionRoutes);

// ❌ No routes after this

// 🔥 Error handler ALWAYS LAST
app.use(errorHandler);

export default app;
