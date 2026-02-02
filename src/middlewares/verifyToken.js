// backend/src/middlewares/verifyToken.js
const jwt = require("jsonwebtoken");
const BaseUser = require("../models/User");

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.error("Authorization header is missing or improperly formatted");
    return res.status(401).json({ message: "Authorization header is missing or improperly formatted" });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    console.error("Token is missing");
    return res.status(401).json({ message: "Token is missing" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await BaseUser.findById(decoded.id).select("role suspended banned");

    if (!user) {
      console.error("Authenticated user not found");
      return res.status(401).json({ message: "User account not found" });
    }

    if (user.banned) {
      console.warn(`Blocked banned user ${user._id}`);
      return res.status(403).json({ message: "Account is banned" });
    }

    if (user.suspended) {
      console.warn(`Blocked suspended user ${user._id}`);
      return res.status(403).json({ message: "Account is suspended" });
    }

    req.user = { id: user._id.toString(), role: user.role };
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      console.warn("Token expired, should attempt refresh.");
      return res.status(401).json({
        message: "Access token expired",
        code: "TOKEN_EXPIRED",
        expiredAt: error.expiredAt,
      });
    }

    console.error("Token verification error:", error.message);
    return res.status(403).json({ message: "Invalid token" });
  }
};

module.exports = verifyToken;
