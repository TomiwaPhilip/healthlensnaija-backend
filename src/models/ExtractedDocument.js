const mongoose = require("mongoose");

const extractedDocumentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    source: { type: String, required: true, default: "PDF Upload" },
    pillar: {
      type: [String],
      enum: [
        "Effective Governance",
        "Efficient",
        "Equitable and Quality Health Systems",
        "Unlocking Value Chains",
        "Health Security",
      ],
      required: false,
    },
    keywords: [{ type: String }],
    content_summary: { type: String },
    full_content: { type: String, required: true },

     // ✅ ADD THIS FIELD
     linkedStoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Story",
      required: false,
    },

    
    status: { type: String, enum: ["pending", "trained"], default: "pending" },
    trainedAt: { type: Date },
    metadata: {
      uploaded_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      upload_date: { type: Date, default: Date.now },
      file_type: { type: String, default: "PDF" },
      size: { type: String },
    },
  },
  { timestamps: true, collection: "ExtractedDocuments" }
);

// ✅ Speed up your query: find({ pillar, keywords: { $in: keywords } })
extractedDocumentSchema.index({ pillar: 1, keywords: 1 });
extractedDocumentSchema.index({ keywords: 1 }); // helpful fallback


module.exports =
  mongoose.models.ExtractedDocument
  || mongoose.model("ExtractedDocument", extractedDocumentSchema);
