const express = require("express");
const router = express.Router();
const verifyToken = require("../middlewares/verifyToken");
const Story = require("../models/Story");
const Chat = require("../models/Chats");

router.get("/", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const query = req.query.q?.trim(); // Ensure query is not empty

    // ✅ Ensure query is not empty before proceeding
    if (!query || query.length < 2) {
      return res.status(400).json({ message: "Search query must be at least 2 characters long." });
    }

    const searchRegex = new RegExp(query, "i"); // Case-insensitive search

    // Search only user-generated chats and generated stories
    const [chats, stories] = await Promise.all([
      Chat.find({
        userId,
        $or: [
          { name: searchRegex }, // Chat name matches
          { "messages.text": searchRegex } // Chat message matches
        ]
      }).limit(5),

      Story.find({
        generatedBy: userId,
        $or: [
          { title: searchRegex }, // Story title matches
          { content: searchRegex }, // Story content matches
          { tags: { $in: [searchRegex] } } // Story tags match
        ]
      }).limit(5)
    ]);

    // ✅ Return structured results for search suggestions
    const results = [
      ...chats.map(c => ({ type: "chat", id: c._id, name: c.name })),
      ...stories.map(s => ({ type: "story", id: s._id, name: s.title }))
    ];

    res.json(results);
  } catch (error) {
    console.error("🚨 Search API Error:", error);
    res.status(500).json({ message: "Search failed", error: error.message });
  }
});

module.exports = router;
