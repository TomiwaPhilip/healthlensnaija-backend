const mongoose = require("mongoose");

const pendingDocumentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    source: { type: String, required: true, default: "User Upload" },
    pillar: {
      type: [String],
      default: [],
    },
    keywords: [{ type: String }],
    content_summary: { type: String },
    full_content: { type: String, required: true },
    linkedStoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Story",
      required: false,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "approved", "rejected", "trained"],
      default: "pending",
    },
    trainedAt: { type: Date },
    metadata: {
      uploaded_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      upload_date: { type: Date, default: Date.now },
      file_type: { type: String, default: "PDF" },
      size: { type: String },
    },
  },
  { timestamps: true, collection: "PendingDocuments" }
);

// ✅ Valid indexes — no compound array indexing
// pendingDocumentSchema.index({ pillar: 1 });
// pendingDocumentSchema.index({ keywords: 1 });

module.exports =
  mongoose.models.PendingDocument ||
  mongoose.model("PendingDocument", pendingDocumentSchema);
