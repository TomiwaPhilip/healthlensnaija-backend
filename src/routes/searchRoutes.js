const express = require("express");
// const client = require("../config/opensearch"); // OpenSearch client
const verifyToken = require("../middlewares/verifyToken");
const Story = require("../models/Story");
const Chat = require("../models/Chats");

const router = express.Router();

router.get("/", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const query = req.query.q?.trim();

    if (!query || query.length < 2) {
      return res.status(400).json({ message: "Search query must be at least 2 characters long." });
    }

    const searchRegex = new RegExp(query, "i");

    const [chats, stories] = await Promise.all([
      Chat.find({
        userId,
        $or: [
          { name: searchRegex },
          { "messages.text": searchRegex }
        ]
      }).limit(5),

      Story.find({
        generatedBy: userId,
        $or: [
          { title: searchRegex },
          { content: searchRegex },
          { tags: { $in: [searchRegex] } }
        ]
      }).limit(5)
    ]);

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
