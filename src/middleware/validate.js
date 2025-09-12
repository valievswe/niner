// middleware/validate.js

const validatePasswordMiddleware = (req, res, next) => {
  const { password } = req.body; // Get password from the request body

  if (!password || password.length < 8) {
    return res.status(400).json({
      error: "Password must be at least 8 characters long.",
    });
  }

  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecialChar) {
    return res.status(400).json({
      error:
        "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character.",
    });
  }

  next();
};

module.exports = { validatePasswordMiddleware };
