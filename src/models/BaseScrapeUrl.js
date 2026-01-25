const mongoose = require("mongoose");

const BaseScrapeUrlSchema = new mongoose.Schema({
  url: { type: String, required: true, unique: true },
  title: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("BaseScrapeUrl", BaseScrapeUrlSchema);
