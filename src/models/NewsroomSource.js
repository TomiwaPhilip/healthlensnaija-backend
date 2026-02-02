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
    url: { type: String, default: "" },
    source_type: {
      type: String,
      enum: ["upload", "pdf", "url"],
      default: "upload",
    },
    vector_status: {
      type: String,
      enum: ["pending", "processing", "indexed", "failed"],
      default: "pending",
    },
    ingest_status: {
      type: String,
      enum: ["pending", "queued", "processing", "indexed", "failed"],
      default: "pending",
      index: true,
    },
    ingest_error: { type: String, default: "" },
    record_count: { type: Number, default: 0 },
    page_count: { type: Number, default: 0 },
    last_indexed_at: { type: Date },
    uploaded_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.NewsroomSource ||
  mongoose.model("NewsroomSource", NewsroomSourceSchema);
