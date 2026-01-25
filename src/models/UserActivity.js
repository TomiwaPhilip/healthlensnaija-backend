// models/UserActivity.js
const mongoose = require("mongoose");

const userActivitySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  date: { type: Date, default: Date.now }, // UTC timestamp
  region: { type: String }, // optional — IP-based or user profile
action: {
  type: String,
  enum: ["login", "story_create", "generate_story", "click", "view"],
  required: true,
},

  language: { type: String }, // ✅ New
  tone: { type: String },
});

module.exports = mongoose.model("UserActivity", userActivitySchema);

