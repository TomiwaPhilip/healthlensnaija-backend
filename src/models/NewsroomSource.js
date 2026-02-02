const mongoose = require("mongoose");

const NewsroomSourceSchema = new mongoose.Schema(
  {
    story: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NewsroomStory",
      required: true,
      index: true,
    },
    filename: { type: String, required: true },
    file_type: { type: String, default: "" },
    file_url: { type: String, required: true },
    vector_status: {
      type: String,
      enum: ["pending", "indexed", "failed"],
      default: "pending",
    },
    uploaded_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.NewsroomSource ||
  mongoose.model("NewsroomSource", NewsroomSourceSchema);
