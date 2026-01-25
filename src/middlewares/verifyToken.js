// backend/src/middlewares/verifyToken.js
const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
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
    req.user = { id: decoded.id, role: decoded.role };
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
