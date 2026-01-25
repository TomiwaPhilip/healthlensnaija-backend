const mongoose = require("mongoose");

const scrapedWebsiteSchema = new mongoose.Schema({
  url: { type: String, required: true, unique: true },
  title: { type: String },
  content: { type: String, required: true },
  preview: { type: String }, // first 300 chars or summary
  tags: [{ type: String }],  // optional for categorization
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

scrapedWebsiteSchema.pre("save", function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("ScrapedWebsite", scrapedWebsiteSchema);
