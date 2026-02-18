// controllers/authController.js

const StandardUser = require("../models/StandardUser");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { Resend } = require("resend");
const { generateAccessToken, generateRefreshToken, rotateRefreshToken } = require("../services/authService");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const resend = new Resend(process.env.RESEND_API_KEY);

const sendMail = async (to, subject, html) => {
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: [to],
      subject,
      html,
    });

    if (error) {
      console.error("Resend sendMail error:", error);
      throw new Error(error.message || "Failed to send email via Resend");
    }

    return data;
  } catch (err) {
    console.error("sendMail caught error:", err);
    throw err;
  }
};

const signup = async (req, res, next) => {
  try {
    const { firstName, lastName, email, phoneNumber, password } = req.body;
    if (!firstName || !lastName || !email || !phoneNumber || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existingUser = await StandardUser.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const hashedPassword = await bcrypt.hash(password.trim(), 10);

    const verificationToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(verificationToken).digest("hex");
    const verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24h

    const user = await StandardUser.create({
      firstName,
      lastName,
      email,
      phoneNumber,
      password: hashedPassword,
      verificationToken: hashedToken,
      verificationTokenExpires,
      isVerified: false,
    });

    const verificationUrl = `${process.env.FRONTEND_URL}/#/verify-email/${verificationToken}`;

    await sendMail(
      email,
      "📧 Please verify your email",
      `
        <p>Hello ${firstName},</p>
        <p>Thank you for registering. Please verify your email by clicking the link below:</p>
        <p><a href="${verificationUrl}">Verify my account</a></p>
      `
    );

    res.status(201).json({ message: "Account created! Please verify your email." });
  } catch (error) {
    next(error);
  }
};

const signin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Missing email or password" });
    }

    const user = await StandardUser.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    if (!user.isVerified) {
      return res.status(400).json({ 
        message: "Please verify your account via the email link before signing in." 
      });
    }

    const isValid = await bcrypt.compare(password.trim(), user.password);
    if (!isValid) {
      user.failedLogins = (user.failedLogins || 0) + 1;
      if (user.failedLogins >= 5) {
        user.suspended = true;
      }
      await user.save();
      return res.status(400).json({ message: "Invalid email or password" });
    }

    user.failedLogins = 0;
    user.lastLogin = new Date();
    user.lastIP = req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress;

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshToken = refreshToken;
    await user.save();

    res.status(200).json({ accessToken, refreshToken });
  } catch (error) {
    next(error);
  }
};

const refreshTokenHandler = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh token missing" });
    }

    const jwt = require("jsonwebtoken");
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const user = await StandardUser.findById(decoded.id);
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(403).json({ message: "Invalid refresh token" });
    }

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = await rotateRefreshToken(user, refreshToken);

    res.status(200).json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (error) {
    next(error);
  }
};

const signout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const user = await StandardUser.findOne({ refreshToken });
    if (user) {
      user.refreshToken = null;
      await user.save();
    }
    res.status(200).json({ message: "Signed out successfully" });
  } catch (error) {
    next(error);
  }
};

const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.params;
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const user = await StandardUser.findOne({ verificationToken: hashedToken });
    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }
    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();
    res.status(200).json({ message: "Email verified successfully!" });
  } catch (error) {
    next(error);
  }
};

module.exports = { signup, signin, refreshTokenHandler, signout, verifyEmail };
