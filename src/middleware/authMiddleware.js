// src/middleware/authMiddleware.js
const jwt = require("jsonwebtoken");

// Middleware to verify the token
const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token) {
    return res
      .status(403)
      .json({ error: "A token is required for authentication." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // decoded payload to the request object
  } catch (err) {
    return res.status(401).json({ error: "Invalid Token." });
  }

  return next();
};

// Middleware to check if user is an Admin
const isAdmin = (req, res, next) => {
  // req.user is available because verifyToken runs first
  if (req.user && req.user.roles && req.user.roles.includes("ADMIN")) {
    next();
  } else {
    res.status(403).json({ error: "Access denied. Admins only." });
  }
};
const isUser = (req, res, next) => {
  // check for the USER role specifically.
  // The 'verifyToken' middleware must have run first to attach req.user.
  if (req.user && req.user.roles && req.user.roles.includes("USER")) {
    return next(); // The user has the 'USER' role, so they can proceed.
  } else {
    // If they don't have the USER role, they are not allowed to perform this action.
    return res.status(403).json({
      error: "Access denied. This action is for assigned test-takers only.",
    });
  }
};

module.exports = { verifyToken, isAdmin, isUser };
