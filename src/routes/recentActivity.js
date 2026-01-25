// routes/recentActivity.js
const express = require("express");
const Story = require("../models/Story");
const Chat = require("../models/Chats");
const verifyToken = require("../middlewares/verifyToken");
const router = express.Router();

router.get("/", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch recent stories (limit 5)
    const stories = await Story.find({ generatedBy: userId })
      .sort({ createdAt: -1 })
      .limit(5);

    // Fetch recent chat activity (limit 5)
    const chats = await Chat.find({ userId })
      .sort({ createdAt: -1 })
      .limit(5);

    // Combine and sort all activities by date
    const activities = [
      ...stories.map((story) => ({
        id: story._id,
        title: story.title,
        description: "Story: " + story.title,
        content: story.content, // Include story content
        date: story.createdAt,
        type: "story",
      })),
      ...chats.map((chat) => ({
        id: chat._id,
        title: chat.name || "Chat",
        description: "Chat activity",
        content: chat.messages?.[0]?.text || "No messages", // Include chat content
        date: chat.createdAt,
        type: "chat",
      })),
    ];

    // Sort combined activities in descending order by date
    activities.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.status(200).json(activities);
  } catch (error) {
    console.error("Error fetching recent activity:", error);
    res.status(500).json({ message: "Error fetching recent activity", error: error.message });
  }
});

module.exports = router;
