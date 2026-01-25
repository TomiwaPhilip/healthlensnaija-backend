
//backend/src/routes/dashboardRoutes.js
const express = require("express");
const multer = require("multer");
const verifyToken = require("../middlewares/verifyToken");
const User = require("../models/User");
const path = require("path");
const StandardUser = require("../models/StandardUser");


const router = express.Router();

console.log("Loaded dashboardRoutes.js");

// Get User Information
router.get("/user", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id, "firstName lastName email profilePicture");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Multer Storage for Profile Pictures
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "../uploads/profile-pictures")),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit to 5MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only image files are allowed"), false);
    } else {
      cb(null, true);
    }
  },
});


// Upload Profile Picture
router.post(
  "/profile-picture",
  verifyToken,
  upload.single("profilePicture"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "File upload failed. No file provided." });
      }
      
      const userId = req.user.id;
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Save the profile picture path in the database
      user.profilePicture = `/uploads/profile-pictures/${req.file.filename}`;
      await user.save();

      res.status(200).json({ profilePicture: user.profilePicture });
    } catch (err) {
      res.status(500).json({ message: "Failed to upload profile picture", error: err.message });
    }
  }
);

router.put("/update-profile", verifyToken, async (req, res) => {
  const { firstName, lastName, email } = req.body;
  const userId = req.user.id;

  try {
    const user = await StandardUser.findByIdAndUpdate(
      userId,
      { firstName, lastName, email },
      { new: true }
    );

    res.status(200).json({ message: "Profile updated", user });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ message: "Failed to update profile" });
  }
});

router.get("/me", verifyToken, async (req, res) => {
  console.log("Hit /api/dashboard/me with user ID", req.user.id);

  try {
    // First try StandardUser
    let user = await StandardUser.findById(req.user.id).select(
      "firstName lastName email profilePicture role"
    );

    // If not StandardUser, try OAuthUser
    if (!user) {
      const OAuthUser = require("../models/OAuthUser");
      user = await OAuthUser.findById(req.user.id).select(
        "firstName lastName email profilePicture provider role"
      );
    }

    // If still not found, try BaseUser as a fallback
    if (!user) {
      const BaseUser = require("../models/User");
      user = await BaseUser.findById(req.user.id).select(
        "firstName lastName email profilePicture role"
      );
    }

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ user });
  } catch (err) {
    console.error("Failed to fetch user:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/preferences", verifyToken, async (req, res) => {
  try {
    const { language, tone } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) return res.status(404).json({ message: "User not found" });

    user.language = language || user.language;
    user.tone = tone || user.tone;
    await user.save();

    res.json({ message: "Preferences updated", language: user.language, tone: user.tone });
  } catch (err) {
    res.status(500).json({ message: "Error updating preferences", error: err.message });
  }
});


module.exports = router;