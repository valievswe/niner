const express = require("express");
const cors = require("cors");
const authRoutes = require("./src/routes/user/authRoutes");
const adminRoutes = require("./src/routes/admin/adminRoutes");
const testAdmin = require("./src/routes/admin/testAdmin");
const testUser = require("./src/routes/user/testUser");

const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (req, res) => {
  res.json({
    message: "Server is running!",
    status: "OK",
    timestamp: new Date().toISOString(),
  });
  console.log("received");
});

app.get("/health", (req, res) => {
  res.json({ status: "healthy" });
});

// MIDDLEWARE
app.use(cors());
app.use(express.json());

// ROUTES
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/tests", testAdmin);
app.use("/api/tests", testUser);
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
