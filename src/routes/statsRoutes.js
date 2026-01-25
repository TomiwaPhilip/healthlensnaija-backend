const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Story = require("../models/Story");
const Chat = require("../models/Chats");

// Fetch dashboard statistics
router.get("/stats", async (req, res) => {
  try {
    // Fetch total users
    const totalUsers = await User.countDocuments();

    // Fetch active users (users who logged in within the last 30 days)
    const activeUsers = await User.countDocuments({
      lastLogin: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    });

    // Fetch total stories created
    const totalStories = await Story.countDocuments();

    // Fetch average engagement (e.g., average likes per story)
    const stories = await Story.find({}, { likes: 1 });

    // Handle cases where `likes` might be undefined
    const totalLikes = stories.reduce((sum, story) => {
      return sum + (story.likes ? story.likes.length : 0);
    }, 0);

    const avgEngagement = totalStories > 0 ? (totalLikes / totalStories).toFixed(2) : 0;

    res.status(200).json({
      totalUsers,
      activeUsers,
      totalStories,
      avgEngagement,
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ message: "Failed to fetch stats", error: error.message });
  }
});

module.exports = router;
