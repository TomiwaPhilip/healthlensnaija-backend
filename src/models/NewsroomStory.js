const mongoose = require("mongoose");

const MetadataSchema = new mongoose.Schema(
  {
    tags: { type: [String], default: [] },
    region: { type: String, default: "" },
  },
  { _id: false }
);

const NewsroomStorySchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    preview_text: { type: String, default: "" },
    metadata: { type: MetadataSchema, default: () => ({}) },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.NewsroomStory ||
  mongoose.model("NewsroomStory", NewsroomStorySchema);
