// models/Report.js
const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema({
  title: { type: String, required: true },
  date: { type: Date, required: true }, // The date the report was created or is relevant to the report
  description: { type: String, required: true },
  category: { type: String }, // e.g., "User Growth", "Engagement", etc.
  metrics: {
    totalViews: { type: Number, default: 0 },
    totalClicks: { type: Number, default: 0 },
    conversionRate: { type: Number, default: 0 } // Percentage value
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Reference to the User model (or BaseUser)
  additionalData: { type: mongoose.Schema.Types.Mixed } // Field for any extra data
}, { timestamps: true });

module.exports = mongoose.model("Report", reportSchema);
