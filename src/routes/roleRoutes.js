// backend/src/routes/roleRoutes.js
const express       = require("express");
const mongoose      = require("mongoose");
const verifyToken = require("../middlewares/verifyToken");      // <-- auth middleware
const allowedRoles  = require("../middlewares/checkRole");  // <-- role checker
const User          = require("../models/Role");            // or whatever model

const router = express.Router();

// PUT /api/roles/:id/role
router.put(
  "/:id/role",
  verifyToken,                  // first validate & decode JWT
  allowedRoles(["Admin"]),      // then ensure `req.user.role === "Admin"`
  async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }
    try {
      const user = await User.findByIdAndUpdate(
        id,
        { role: req.body.role },
        { new: true }
      );
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ message: "Role updated successfully!", user });
    } catch (err) {
      console.error("Error updating role:", err);
      res.status(500).json({ message: "Error updating role", error: err.message });
    }
  }
);

module.exports = router;
