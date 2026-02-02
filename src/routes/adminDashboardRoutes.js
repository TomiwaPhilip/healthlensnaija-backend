const express = require("express");
const router = express.Router();

const verifyToken = require("../middlewares/verifyToken");
const checkRole = require("../middlewares/checkRole");
const BaseUser = require("../models/User");
const Chat = require("../models/Chats");
const NewsroomStory = require("../models/NewsroomStory");
const NewsroomArtifact = require("../models/NewsroomArtifact");
const UserActivity = require("../models/UserActivity");

const ROLE_WHITELIST = ["Admin", "Verified", "Guest", "Editor", "Analyst", "Moderator"];

router.use(verifyToken, checkRole(["Admin"]));

router.get("/stats", async (_req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalUsers,
      totalStories,
      totalArtifacts,
      totalChats,
      dailyActiveIds,
      monthlyActiveIds,
    ] = await Promise.all([
      BaseUser.countDocuments(),
      NewsroomStory.countDocuments(),
      NewsroomArtifact.countDocuments(),
      Chat.countDocuments(),
      UserActivity.distinct("userId", { date: { $gte: startOfDay } }),
      UserActivity.distinct("userId", { date: { $gte: thirtyDaysAgo } }),
    ]);

    res.json({
      totalUsers,
      totalStories,
      totalArtifacts,
      totalChats,
      dailyActiveUsers: dailyActiveIds.length,
      monthlyActiveUsers: monthlyActiveIds.length,
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    res.status(500).json({ message: "Failed to load admin stats" });
  }
});

router.get("/users", async (_req, res) => {
  try {
    const users = await BaseUser.find()
      .select("firstName lastName email role suspended banned createdAt lastLogin")
      .sort({ createdAt: -1 });

    res.json(users);
  } catch (error) {
    console.error("Fetch users error:", error);
    res.status(500).json({ message: "Failed to load users" });
  }
});

router.patch("/users/:id/role", async (req, res) => {
  try {
    const { role } = req.body;
    if (!role || !ROLE_WHITELIST.includes(role)) {
      return res.status(400).json({ message: "Invalid role specified" });
    }

    const user = await BaseUser.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    ).select("firstName lastName email role suspended banned");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Update role error:", error);
    res.status(500).json({ message: "Failed to update role" });
  }
});

router.patch("/users/:id/suspend", async (req, res) => {
  try {
    const suspended = req.body.suspended ?? true;
    const user = await BaseUser.findByIdAndUpdate(
      req.params.id,
      { suspended: Boolean(suspended) },
      { new: true }
    ).select("firstName lastName email role suspended banned");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Suspend user error:", error);
    res.status(500).json({ message: "Failed to update suspension state" });
  }
});

router.patch("/users/:id/ban", async (req, res) => {
  try {
    const banned = req.body.banned ?? true;
    const user = await BaseUser.findByIdAndUpdate(
      req.params.id,
      { banned: Boolean(banned) },
      { new: true }
    ).select("firstName lastName email role suspended banned");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Ban user error:", error);
    res.status(500).json({ message: "Failed to update ban state" });
  }
});

router.delete("/users/:id", async (req, res) => {
  try {
    const user = await BaseUser.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: "User removed" });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ message: "Failed to delete user" });
  }
});

module.exports = router;
