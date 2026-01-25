// services/authService.js
const jwt = require("jsonwebtoken");
const StandardUser = require("../models/StandardUser");

const generateAccessToken = (user) => {
  // console.log("Generating access token for:", user._id);
  // include role so downstream middleware can read it
  return jwt.sign(
    { 
      id: user._id, 
      email: user.email, 
      role: user.role 
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

const generateRefreshToken = (user) => {
  // console.log("Generating refresh token for:", user._id);
  // optionally include role here too
  return jwt.sign(
    { 
      id: user._id,
      role: user.role 
    },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: "7d" }
  );
};

const rotateRefreshToken = async (user, oldToken) => {
  // Optionally verify oldToken against a blacklist before proceeding…
  const newRefreshToken = generateRefreshToken(user);
  user.refreshToken = newRefreshToken;
  await user.save();
  return newRefreshToken;
};

module.exports = { generateAccessToken, generateRefreshToken, rotateRefreshToken };
