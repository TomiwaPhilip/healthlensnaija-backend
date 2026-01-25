// routes/overview.js
const express = require("express");
const mongoose = require("mongoose");
const Story = require("../models/Story");
const Chat = require("../models/Chats");
const verifyToken = require("../middlewares/verifyToken");
const router = express.Router();

router.get("/", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // ✅ Match logic from /stories route
    const storyFilter = {
      $and: [
        {
          $or: [
            { generatedBy: new mongoose.Types.ObjectId(userId) },
            { generatedBy: userId }
          ]
        },
        {
          $or: [
            { isUploadedStory: { $exists: false } },
            { isUploadedStory: false }
          ]
        }
      ]
    };

    const storyCount = await Story.countDocuments(storyFilter);
    const chatCount = await Chat.countDocuments({ userId });

    const recentStories = await Story.find(storyFilter)
      .sort({ createdAt: -1 })
      .limit(5);

    const recentChats = await Chat.find({ userId })
      .sort({ createdAt: -1 })
      .limit(5);

    const data = [
      {
        id: "generate-story",
        title: "Generate Story Angles",
        value: storyCount,
        description: "Stories Created This Week",
        metrics: [
          { label: "Published", value: 8 },
          { label: "Downloaded", value: 3 },
          { label: "Waiting for Approval", value: 1 },
        ],
        stories: recentStories.map((story) => ({
          id: story._id,
          title: story.title,
          status: "Published", // Adjust dynamically if you track status
          link: `/story/${story._id}`,
        })),
      },
      {
        id: "ai-conversation",
        title: "AI Conversation",
        value: chatCount,
        description: "Chat Sessions",
        metrics: [
          { label: "Completed", value: 4 },
          { label: "Ongoing", value: 1 },
        ],
        conversations: recentChats.map((chat) => ({
          id: chat._id,
          title: chat.name || "Chat",
          link: `/chat/${chat._id}`,
        })),
      },
    ];

    res.status(200).json(data);
  } catch (error) {
    console.error("❌ Error in overview route:", error);
    res.status(500).json({
      message: "Error fetching overview",
      error: error.message,
    });
  }
});

module.exports = router;
