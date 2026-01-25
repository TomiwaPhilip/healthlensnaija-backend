// backend/src/models/TrainingDocument.js
const mongoose = require("mongoose");

const TrainingDocumentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  source: { type: String, default: "Training Upload" },
  url: { type: String },
  pillar: { type: String },
  keywords: [{ type: String }],
  content_summary: { type: String },
  full_content: { type: String, required: true },
  tables: { type: Array, default: [] },
  embedding: { type: [Number] },

  status: { type: String, enum: ["pending", "trained"], default: "pending" },
  trainedAt: { type: Date },

  metadata: {
    uploaded_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    upload_date: { type: Date, default: Date.now },
    file_type: { type: String },
    size: { type: String },
  }
}, { collection: "extracteddocuments", timestamps: true });

module.exports = mongoose.model("TrainingDocument", TrainingDocumentSchema);
