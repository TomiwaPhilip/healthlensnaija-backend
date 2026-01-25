// services/authTokens.js
const jwt = require("jsonwebtoken");

const generateAccessToken = (user) => {
  console.log("Generating access token for:", user._id);
  return jwt.sign(
    { 
      id: user._id, 
      email: user.email, 
      role: user.role 
    },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
};

const generateRefreshToken = (user) => {
  console.log("Generating refresh token for:", user._id);
  return jwt.sign(
    { 
      id: user._id, 
      role: user.role 
    },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: "7d" }
  );
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
};
