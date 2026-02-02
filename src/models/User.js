const mongoose = require("mongoose");

const baseUserSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String },
  email: { type: String, required: true, unique: true },
  profilePicture: { type: String },
  language: { type: String, default: "en" },
tone: { type: String, default: "formal" },

  role: { 
    type: String, 
    enum: ["Admin", "Verified", "Guest", "Editor", "Analyst", "Moderator"], 
    default: "Guest" 
  },
  tier: { type: String, enum: ["guest", "verified"], default: "guest" },
  // New fields
  suspended: { type: Boolean, default: false },
  banned: { type: Boolean, default: false },
  lastLogin: { type: Date },
  lastIP: { type: String },
  failedLogins: { type: Number, default: 0 },
  
  createdAt: { type: Date, default: Date.now },
  stories: [{ type: mongoose.Schema.Types.ObjectId, ref: "Story" }]
}, { discriminatorKey: "userType" });

// Add a virtual property to populate stories
baseUserSchema.virtual("populatedStories", {
  ref: "Story", // Reference the Story model
  localField: "stories", // Field in BaseUser that stores story IDs
  foreignField: "_id", // Field in Story that matches the IDs
});

// Ensure virtual fields are included in toObject and toJSON outputs
baseUserSchema.set("toObject", { virtuals: true });
baseUserSchema.set("toJSON", { virtuals: true });

const BaseUser = mongoose.model("BaseUser", baseUserSchema);
module.exports = BaseUser;