// backend/server.js

import app from "./app.js";

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Workspace backend running on port ${PORT}`);
});
