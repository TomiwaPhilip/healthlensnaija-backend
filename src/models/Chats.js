const mongoose = require("mongoose");

// models/Chats.js
const chatSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "BaseUser", required: true },
  name: { type: String, required: true, default: "Chat 1" },
  isStructuredMode: { type: Boolean, default: false },
  messages: [
    {
      user: { type: String, required: true },
      text: { type: String, required: true },
      timestamp: { type: Date, default: Date.now },
      edits: [
        {
          text: String,
          timestamp: { type: Date, default: Date.now },
        },
      ],
    },
  ],
  linkedStoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Story", default: null },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Chat", chatSchema);
