const mongoose = require("mongoose");

const NewsroomMessageSchema = new mongoose.Schema(
  {
    story: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NewsroomStory",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["user", "assistant", "system"],
      required: true,
    },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.NewsroomMessage ||
  mongoose.model("NewsroomMessage", NewsroomMessageSchema);
