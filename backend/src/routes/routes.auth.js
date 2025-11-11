const express = require("express");
const rateLimit = require("express-rate-limit");
const { body, validationResult } = require("express-validator");
const { User } = require("../models");
const AuthMiddleWare = require("../middleware/middleware.auth.js");

module.exports = (logger) => {
  const router = express.Router();

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 requests per windowMs
    message: { error: "Too many requests, please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const registerValidation = [
    body("username")
      .trim()
      .isLength({ min: 3, max: 30 })
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage(
        "Username must be 3-30 characters and contain only letters, numbers, underscore, or dash"
      ),
    body("email")
      .trim()
      .isEmail()
      .normalizeEmail()
      .withMessage("Please provide a valid email address"),
    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters")
      .matches(/[A-Z]/)
      .withMessage("Password must contain at least one uppercase letter")
      .matches(/[0-9]/)
      .withMessage("Password must contain at least one number"),
  ];

  const loginValidation = [
    body("email").isEmail().normalizeEmail(),
    body("password").notEmpty(),
  ];

  /**
   * @swagger
   * /api/auth/register:
   *   post:
   *     summary: Register a new user
   *     tags: [Authentication]
   *     security: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - username
   *               - email
   *               - password
   *             properties:
   *               username:
   *                 type: string
   *                 minLength: 3
   *                 maxLength: 30
   *                 example: johndoe
   *               email:
   *                 type: string
   *                 format: email
   *                 example: john@example.com
   *               password:
   *                 type: string
   *                 minLength: 6
   *                 example: password123
   *
   *     responses:
   *       201:
   *         description: User registered successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 message:
   *                   type: string
   *                 user:
   *                   $ref: '#/components/schemas/User'
   *                 token:
   *                   type: string
   *       400:
   *         description: Validation error or user already exists
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.post("/register", registerValidation, async (req, res) => {
    try {
      const errors = validationResult(req);
      console.log("errors", errors);
      if (!errors.isEmpty()) {
        // Format errors properly
        const formattedErrors = {};
        errors.array().forEach((error) => {
          formattedErrors[error.path] = error.msg;
        });

        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: formattedErrors,
        });
      }
      const { username, email, password } = req.body;
      console.log("request", req.body);

      const existingUser = await User.findOne({
        $or: [{ email }, { username }],
      });

      if (existingUser) {
        return res.status(400).json({
          error:
            existingUser.email === email
              ? "Email already registerd"
              : "Username already taken",
        });
      }

      const user = new User({ username, email, password });

      await user.save();

      const token = AuthMiddleWare.createToken(user);

      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 24 * 60 * 60 * 1000, // 1 day
      });

      logger.info(`User ${user.username} registered successfully`);

      res.status(201).json({
        success: true,
        message: "Account created successfully",
        user: user.getPublicProfile(),
        // token,
      });
    } catch (error) {
      logger.error("Registration error:", error);
      if (error.code === 11000) {
        // Duplicate key error
        const field = Object.keys(error.keyPattern)[0];
        const message = `This ${field} is already registered`;
        return res.status(400).json({
          success: false,
          message,
          errors: { [field]: message },
        });
      }

      res.status(500).json({
        success: false,
        message: "Something went wrong. Please try again later",
        error: "Registration failed. Please try again.",
      });
    }
  });

  /**
   * @swagger
   * /api/auth/login:
   *   post:
   *     summary: Login user
   *     tags: [Authentication]
   *     security: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - email
   *               - password
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *                 example: john@example.com
   *               password:
   *                 type: string
   *                 example: password123
   *     responses:
   *       200:
   *         description: Login successful
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 message:
   *                   type: string
   *                 user:
   *                   $ref: '#/components/schemas/User'
   *                 token:
   *                   type: string
   *       401:
   *         description: Invalid credentials
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.post("/login", loginValidation, async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        // Format errors properly
        const formattedErrors = {};
        errors.array().forEach((error) => {
          formattedErrors[error.path] = error.msg;
        });

        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: formattedErrors,
        });
      }

      const { email, password } = req.body;

      const user = await User.findOne({ email });

      if (!user) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      if (!user.isActive) {
        return res.status(401).json({ error: "Account is not active" });
      }

      const isValidPassword = await user.comparePassword(password);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      user.lastLogin = new Date();
      await user.save();

      const token = AuthMiddleWare.createToken(user);

      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 24 * 60 * 60 * 1000, // 1 day
      });

      logger.info(`User ${user.username} logged in successfully`);

      res.json({
        success: true,
        message: "Login successful",
        user: user.getPublicProfile(),
        // token,
      });
    } catch (error) {
      logger.error("Login error:", error);
      res.status(500).json({ error: "Login failed. Please try again." });
    }
  });

  router.post("/refresh-token", async (req, res) => {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({ error: "Token is required" });
      }

      const newToken = AuthMiddleWare.refreshToken(token);

      res.json({
        success: true,
        token: newToken,
      });
    } catch (error) {
      logger.error("Token refresh error", error);
      res.status(401).json({ error: "unable to refresh token" });
    }
  });

  router.get("/me", AuthMiddleWare.authenticate, async (req, res) => {
    try {
      const user = await User.findById(req.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        success: true,
        user: user.getPublicProfile(),
      });
    } catch (error) {
      logger.error("Get profile error:", error);
      res.status(500).json({ error: "Unable to fetch profile" });
    }
  });

  router.put(
    "/me",
    AuthMiddleWare.authenticate,
    [body("bio").optional().isLength({ max: 500 })],
    async (req, res) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res
            .status(400)
            .json({ error: "Validation failed", details: errors.array() });
        }

        const { username, bio, preferences } = req.body;
        const user = await User.findById(req.userId);

        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        // Update allowed fields
        //   bit of exaggeration
        if (username !== undefined) user.username = username;
        if (bio !== undefined) user.bio = bio;
        if (preferences !== undefined) {
          user.preferences = { ...user.preferences, ...preferences };
        }

        await user.save();

        res.json({
          success: true,
          message: "Profile updated successfully",
          user: user.getPublicProfile(),
        });
      } catch (error) {
        logger.error("Profile update error:", error);
        res.status(500).json({ error: "Unable to update profile" });
      }
    }
  );

  router.post("/logout", AuthMiddleWare.authenticate, async (req, res) => {
    // In a more complex system, you might invalidate the token here
    // For now, we just log the logout event
    //   should i do it now? TODO:
    try {
      logger.info(`User ${req.user.username} logged out`);
      res.clearCookie("token");
      res.json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (error) {
      logger.error("Logout error:", error);
      res.status(500).json({ error: "Unable to logout" });
    }
  });

  return router;
};
