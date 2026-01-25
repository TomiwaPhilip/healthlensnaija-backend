// backend/src/middlewares/checkRole.js
module.exports = function allowedRoles(roles = []) {
  return (req, res, next) => {
    console.log("▶️ checkRole got:", req.user.role, "allowed:", roles);
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden: insufficient permissions" });
    }
    next();
  };
};
