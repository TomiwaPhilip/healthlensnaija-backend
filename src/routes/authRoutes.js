/* The above code is a Node.js Express router file that handles user authentication and authorization
functionalities. Here is a summary of what the code does: */
require("dotenv").config();
const express = require("express");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const passport = require("passport");
const StandardUser = require("../models/StandardUser");
const OAuthUser = require("../models/OAuthUser");
//const nodemailer = require("nodemailer");
const BaseUser = require("../models/User");
const crypto = require("crypto");
const { generateOTP, hashOTP } = require("../utils/otpService");
const { forgotLimiter, forgotIPLimiter } = require('../utils/rateLimiter');
const router = express.Router();

const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

const sendMail = async (to, subject, html) => {
  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM,  // e.g. "YourApp <no-reply@yourdomain.com>"
    to: [ to ],
    subject,
    html
  });
  if (error) {
    console.error("Resend sendMail error:", error);
    throw new Error(error.message || "Failed to send email via Resend");
  }
  return data;
};


// const verifyToken = require("../middlewares/dbauth");
const verifyToken = require("../middlewares/verifyToken");
// Function to validate password strength
const validatePassword = (password) => {
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasMinLength = password.length >= 6;

  return hasUpperCase && hasLowerCase && hasNumbers && hasMinLength;
};

// Utility functions for token generation
const generateAccessToken = (user) => {
  // console.log("Generating access token for:", user._id);
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

const generateRefreshToken = (user) => {
  // console.log("Generating refresh token for:", user._id);
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: "7d" }
  );
};


// const transporter = nodemailer.createTransport({
//   service: "Gmail",
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASS,
//   },
// });

// const sendMail = (to, subject, html) => {
//   return transporter.sendMail({ to, subject, html });
// };


const makeTokens = (user) => {
  const access  = jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
  const refresh = jwt.sign(
    { id: user._id, role: user.role },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: "7d" }
  );
  return { access, refresh };
};

// Sign-Up Route


router.post("/signup", async (req, res) => {
  const { firstName, lastName, email, phoneNumber, password } = req.body;

  // 1) Required fields
  if (!firstName || !lastName || !email || !phoneNumber || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  // 2) Already exists?
  const exists = await StandardUser.findOne({ email });
  if (exists) {
    return res.status(400).json({ message: "User already exists" });
  }

  // 3) Validate password strength
  if (!validatePassword(password)) {
    return res.status(400).json({
      message:
        "Password must be at least 6 characters and include an uppercase letter, a lowercase letter, and a number.",
    });
  }

  // 4) Optional: basic email & phone format checks
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: "Invalid email format" });
  }
  if (!/^\d{10,15}$/.test(phoneNumber)) {
    return res.status(400).json({ message: "Invalid phone number format" });
  }

  // 5) Hash password
  const hashedPassword = await bcrypt.hash(password.trim(), 10);
  // 6) Create a one-time verification token
  const rawToken    = crypto.randomBytes(32).toString("hex");
  const tokenHash   = crypto.createHash("sha256").update(rawToken).digest("hex");
  const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); //24h

  // 7) Save user (unverified)
  const user = await StandardUser.create({
    firstName,
    lastName,
    email,
    phoneNumber,
    password: hashedPassword,
    isVerified: false,
    role: "Guest",
    verificationToken:        tokenHash,
    verificationTokenExpires: tokenExpiry,
  });

  // 8) Send the email-verification link
  const verifyUrl = `${process.env.FRONTEND_URL}/verify-email/${rawToken}`;
  await sendMail(
    email,
    "📧 Please verify your email",
    `
      <p>Hey ${firstName},</p>
      <p>Thanks for signing up! Click below to verify your address (expires in 24h):</p>
      <p><a href="${verifyUrl}">Verify my account</a></p>
    `
  );

  // 9) Tell the client to check their inbox
  res.status(201).json({
    message: "Account created! Please check your email to verify your account.",
  });
});



router.post("/reset-password-otp", async (req, res) => {
  const { email, otp, newPassword } = req.body;
  // 1) Basic checks
  if (!email || !otp || !newPassword) {
    return res.status(400).json({ message: "Email, OTP and new password are required." });
  }
  // 2) Strong password rule
  if (!validatePassword(newPassword)) {
    return res.status(400).json({
      message: "Password must be at least 6 chars and include uppercase, lowercase, and number."
    });
  }
  // 3) Lookup user
  const user = await StandardUser.findOne({ email });
  if (!user || !user.otp || Date.now() > user.otpExpires) {
    return res.status(400).json({ message: "OTP expired or user not found." });
  }
  // 4) Prevent brute-force
  if (user.otpAttempts >= 5) {
    return res.status(429).json({ message: "Maximum OTP attempts reached." });
  }
  // 5) Verify OTP
  if (hashOTP(otp) !== user.otp) {
    user.otpAttempts++;
    await user.save();
    return res.status(400).json({ message: "Invalid OTP." });
  }
  // 6) All good → update password
  user.password = await bcrypt.hash(newPassword.trim(), 10);
  user.otp                 = undefined;
  user.otpExpires          = undefined;
  user.otpAttempts         = 0;

  // 7) Issue new tokens so they stay logged in
  const accessToken  = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  user.refreshToken  = refreshToken;
  await user.save();

  // 8) Send confirmation email
  // 8) Send confirmation email
  await sendMail(
      user.email,
      "✅ Password Reset Successful",
      `
        <p>Hi ${user.firstName || ""},</p>
        <p>Your password has been reset successfully. If you did not do this, please contact support immediately.</p>
      `
    );

  // 9) Respond with new tokens
  res.status(200).json({
    message: "Password reset successful.",
    accessToken,
    refreshToken
  });
});

router.post("/resend-otp", async (req, res) => {
  const ip    = req.ip;
  const email = (req.body.email || "").toLowerCase();

  // ✅ Only apply Redis rate-limit in production
  if (process.env.NODE_ENV === "production") {
    try {
      await Promise.all([
        forgotEmailLimiter.consume(email),
        forgotIPLimiter.consume(ip),
      ]);
    } catch (rlRes) {
      let retrySec = 60; // default to 60s if msBeforeNext is missing
  
      if (typeof rlRes?.msBeforeNext === "number") {
        retrySec = Math.ceil(rlRes.msBeforeNext / 1000);
      }
  
      res.set("Retry-After", retrySec.toString());
  
      return res.status(429).json({
        message: `Too many requests. Retry after ${retrySec}s.`,
        retryAfter: retrySec,
      });
    }
  }

  // 2) Lookup
  const user = await StandardUser.findOne({ email });
  if (!user) {
    return res.status(404).json({ message: "User not found." });
  }

  // 3) Cool-down of 60s (always apply, even in dev)
  if (user.otpLastSent && (Date.now() - user.otpLastSent.getTime()) < 60_000) {
    return res
      .status(429)
      .json({ message: "Please wait at least 60 seconds before requesting another OTP." });
  }

  // 4) Generate & store new OTP
  const otpCode    = generateOTP();
  const otpHash    = hashOTP(otpCode);
  user.otp         = otpHash;
  user.otpExpires  = Date.now() + 10 * 60 * 1000;  // 10 min
  user.otpAttempts = 0;
  user.otpLastSent = new Date();
  await user.save();

  // 5) Email OTP
  await sendMail(
    email,
    "🔄 Your new OTP code",
    `
      <p>Your new OTP is <b>${otpCode}</b>.</p>
      <p>It expires in 10 minutes.</p>
    `
  );
  

  // 6) Respond
  res.status(200).json({ message: "OTP resent successfully." });
});


router.get("/verify-email/:token", async (req, res) => {
  const { token } = req.params;

  try {
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const now = new Date();

    // ✅ Look for either StandardUser OR OAuthUser
    const user = await BaseUser.findOne({
      verificationToken: hashedToken,
      $or: [
        { verificationTokenExpires: { $gt: now } },
        { verificationTokenExpires: { $exists: false } }
      ]
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;

    // issue tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    user.refreshToken = refreshToken;

    await user.save();

    res.status(200).json({
      message: "Email verified successfully!",
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error("Email Verification Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});


// Sign-In Route
router.post("/signin", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    console.error("Missing email or password");
    return res.status(400).json({ message: "Invalid email or password" });
  }

  try {
    const user = await StandardUser.findOne({ email });
    if (!user) {
      console.error("User not found for email:", email);
      return res.status(400).json({ message: "Invalid email or password" });
    }

    if (!user.isVerified) {
      return res.status(400).json({ message: "Please verify your account via OTP before signing in." });
    }

    // Compare passwords
    const trimmedPassword = password.trim();
    // console.log("Input password (trimmed):", trimmedPassword);
    // console.log("Retrieved password hash from DB:", user.password);

    const isPasswordValid = await bcrypt.compare(trimmedPassword, user.password);
    // console.log("Password validation result:", isPasswordValid);

    if (!isPasswordValid) {
      return res.status(400).json({ message: "Invalid email or password" });
    }
    // console.log("Email (Sign-In):", email);
    // console.log("Trimmed Password (Sign-In):", password.trim());
    // console.log("Stored Password Hash (DB):", user.password);
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshToken = refreshToken;
    await user.save();

    res.status(200).json({ accessToken, refreshToken });
  } catch (error) {
    console.error("Sign-In Error:", error.message);
    res.status(500).json({ message: `Error signing in: ${error.message}` });
  }
});

// Refresh Token Route
router.post("/refresh-token", async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ message: "Refresh token is missing" });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const user = await StandardUser.findById(decoded.id);

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(403).json({ message: "Invalid refresh token" });
    }

    const accessToken = generateAccessToken(user);
    res.status(200).json({ accessToken });
  } catch (error) {
    console.error("Refresh Token Error:", error.message);
    res.status(403).json({ message: "Invalid or expired refresh token" });
  }
});

// Sign-Out Route
router.post("/signout", async (req, res) => {
  const { refreshToken } = req.body;

  try {
    const user = await StandardUser.findOne({ refreshToken });
    if (user) {
      user.refreshToken = null;
      await user.save();
    }

    res.status(200).json({ message: "Signed out successfully" });
  } catch (error) {
    console.error("Sign-Out Error:", error.message);
    res.status(500).json({ message: "Error signing out" });
  }
});

// Forgot Password Route
router.post("/forgot-password", async (req, res) => {
  const ip = req.ip;
  const email = (req.body.email || '').toLowerCase();

  // ✅ Apply rate limiting only in production
  if (process.env.NODE_ENV === "production") {
    try {
      await Promise.all([
        forgotLimiter.consume(email),
        forgotIPLimiter.consume(ip),
      ]);
    } catch (rlRes) {
      let retrySec = 60; // default to 60s if msBeforeNext is missing
      if (typeof rlRes?.msBeforeNext === "number") {
        retrySec = Math.ceil(rlRes.msBeforeNext / 1000);
      }

      res.set("Retry-After", retrySec.toString());
      return res.status(429).json({
        message: `Too many requests. Retry after ${retrySec}s.`,
        retryAfter: retrySec,
      });
    }
  }

  try {
    const user = await BaseUser.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User with this email does not exist" });
    }

    if (!(user instanceof StandardUser)) {
      return res.status(400).json({
        message: "Password reset not supported for this user type",
      });
    }

    // Generate and save reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 mins
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    // 🚀 Send reset email via Resend
    await sendMail(
      user.email,
      "Password Reset Request",
      `
        <p>You requested a password reset. Click the link below:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>If you did not request this, please ignore this email.</p>
      `
    );

    console.log("✅ Password reset email sent to:", user.email);

    // ✅ Respond to client
    return res.status(200).json({
      message: "Password reset link generated successfully. Check your inbox.",
    });

  } catch (error) {
    console.error("Forgot Password Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});


router.post("/reset-password/:token", async (req, res) => {
  const { token } = req.params;
  const { newPassword } = req.body;

  try {
    // 1. Validate password strength
    if (!validatePassword(newPassword)) {
      return res.status(400).json({
        message: "Password must be at least 6 characters and include uppercase, lowercase, and number.",
      });
    }

    // 2. Hash the token for secure comparison
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // 3. Lookup user with valid token and expiry
    const user = await StandardUser.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    // 4. Hash and save new password
    user.password = await bcrypt.hash(newPassword.trim(), 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    // 5. Send confirmation email
   // 5. Send confirmation email
 await sendMail(
        user.email,
        "Password Reset Confirmation",
        `
          <p>Hello ${user.firstName || "there"},</p>
          <p>This is a confirmation that your password was successfully reset.</p>
          <p>If you did not perform this action, please contact our support immediately.</p>
        `
      );

    // 6. Respond
    res.status(200).json({ message: "Password reset successful. A confirmation email has been sent." });

  } catch (error) {
    console.error("Reset Password Error:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.post("/change-password", verifyToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await StandardUser.findById(req.user.id);

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) return res.status(400).json({ message: "Incorrect current password" });

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();

  res.status(200).json({ message: "Password updated successfully" });
});

// Google Authentication
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"], prompt: "select_account" })
);
router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/signin" }),
  async (req, res) => {
    if (!req.user) {
      return res.redirect(`${process.env.FRONTEND_URL}/signin`);
    }

    try {
      const user = req.user; // This comes from your GoogleStrategy

      // If not verified, send verification email and block login
      if (!user.isVerified) {
                if (user._needsVerificationEmail) {
                  const verifyUrl = `${process.env.FRONTEND_URL}/verify-email/${user._needsVerificationEmail.token}`;
                  await sendMail(
                    user.email,
                    "📧 Please verify your email",
                    `
                      <p>Hello ${user.firstName || ""},</p>
                      <p>Thanks for signing in with Google. Please verify your email:</p>
                      <p><a href="${verifyUrl}">Verify my account</a></p>
                    `
                  );
                }
        
                return res.redirect(
                  `${process.env.FRONTEND_URL}/pending-verification?email=${encodeURIComponent(user.email)}`
                );
              }

      // ✅ If already verified → normal login
      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);
      user.refreshToken = refreshToken;
      await user.save();

      const userInfo = encodeURIComponent(JSON.stringify({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture
      }));
      
      res.redirect(
        `${process.env.FRONTEND_URL}/oauth/callback?token=${accessToken}&refreshToken=${refreshToken}&user=${userInfo}`
      );
    } catch (err) {
      console.error("Google OAuth Callback Error:", err);
      res.redirect(`${process.env.FRONTEND_URL}/signin?error=oauth_failed`);
    }
  }
);



// Facebook Authentication
router.get("/facebook", passport.authenticate("facebook", { scope: ["email"] }));

router.get(
  "/facebook/callback",
  passport.authenticate("facebook", { failureRedirect: "/signin" }),
  (req, res) => {
    const token = jwt.sign(
         { id: req.user.id, email: req.user.email, role: req.user.role },
         process.env.JWT_SECRET,
         { expiresIn: "1h" }
       );
    res.redirect(`${process.env.FRONTEND_URL}/oauth/callback?token=${token}`);
  }
);

// Twitter Authentication
router.get("/twitter", passport.authenticate("twitter"));

router.get(
  "/twitter/callback",
  passport.authenticate("twitter", { failureRedirect: "/signin" }),
  (req, res) => {
    const token = jwt.sign(req.user, process.env.JWT_SECRET, { expiresIn: "1h" });
    res.redirect(`${process.env.FRONTEND_URL}/oauth/callback?token=${token}`);
  }
);

module.exports = router;
