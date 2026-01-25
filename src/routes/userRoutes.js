// backend/src/routes/roleRoutes.js
const express        = require("express");
const mongoose       = require("mongoose");
const verifyToken    = require("../middlewares/verifyToken");
const allowedRoles   = require("../middlewares/checkRole");
const User           = require("../models/User");        // not ../models/Role

const router = express.Router();

// PUT /api/roles/:id/role
// — only Admins may call this
router.put(
  "/:id/role",
  verifyToken,
  allowedRoles(["Admin"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { role } = req.body;

      // Validate user ID
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res
          .status(400)
          .json({ message: "Invalid user ID format" });
      }

      // Ensure role is provided and valid
      const validRoles = ["Admin", "StandardUser", "Guest"];
      if (!role || !validRoles.includes(role)) {
        return res
          .status(400)
          .json({ message: `Role is required and must be one of: ${validRoles.join(", ")}` });
      }

      // Update
      const user = await User.findByIdAndUpdate(
        id,
        { role },
        { new: true, runValidators: true }
      );

      if (!user) {
        return res
          .status(404)
          .json({ message: "User not found" });
      }

      res
        .status(200)
        .json({ message: "Role updated successfully!", user });
    } catch (error) {
      console.error("Error updating role:", error);
      res
        .status(500)
        .json({ message: "Error updating role", error: error.message });
    }
  }
);

module.exports = router;
