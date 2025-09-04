// routes/authRoutes.js
const express = require("express");
const router = express.Router();
const prisma = require("../../db/index"); // Import the Prisma client instance
const bcrypt = require("bcryptjs"); // For hashing passwords
const { validatePasswordMiddleware } = require("../../middleware/validate");
const jwt = require("jsonwebtoken");

// User Registration Route
router.post("/register", validatePasswordMiddleware, async (req, res) => {
  const {
    email,
    username,
    password,
    firstName,
    lastName,
    personalID,
    phoneNumber,
  } = req.body;

  if (
    !email ||
    !username ||
    !password ||
    !firstName ||
    !lastName ||
    !personalID ||
    !phoneNumber
  ) {
    return res.status(400).json({ error: "All fields are required." });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: {
        email,
        username,
        passwordHash: hashedPassword,
        firstName,
        lastName,
        personalID,
        phoneNumber,
      },
    });
    res.status(201).json(newUser);
  } catch (error) {
    if (error.code === "P2002") {
      // Unique constraint failed
      return res
        .status(409)
        .json({ error: "Email or username or Personal ID already exists." });
    }
    res
      .status(500)
      .json({ error: "Something went wrong while creating the user." });
  }
});
router.post("/login", async (req, res) => {
  const { personalID, password } = req.body;

  if (!personalID || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    // Find the user by personalId
    const user = await prisma.user.findUnique({
      where: { personalID },
      include: {
        roles: { include: { role: true } },
      },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    // Check if the password is correct
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    // Extract the role names
    const roleNames = user.roles.map((userRole) => userRole.role.name);

    // -- JWT Payload
    const payload = {
      userId: user.id,
      personalID: user.personalID,
      roles: roleNames,
      firstName: user.firstName,
    };

    // Sign the token
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "1d", // Token expires in 1 day
    });

    // Send the token to the client
    res.json({
      message: "Login successful!",
      token: token,
    });
  } catch (error) {
    res.status(500).json({ error: "Something went wrong during login." });
  }
});

module.exports = router;
