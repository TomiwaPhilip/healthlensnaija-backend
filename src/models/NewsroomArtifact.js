const mongoose = require("mongoose");

const NewsroomArtifactSchema = new mongoose.Schema(
  {
    story: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NewsroomStory",
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    type: {
      type: String,
      enum: ["story", "report", "summary"],
      default: "story",
    },
    content: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.NewsroomArtifact ||
  mongoose.model("NewsroomArtifact", NewsroomArtifactSchema);
