// models/Notification.js
const mongoose = require("mongoose");

// models/Notification.js
const notificationSchema = new mongoose.Schema({
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { 
    type: String, 
    enum: ["story", "chat", "alert"], // 👈 add alert
    required: true 
  },
  relatedEntity: { type: mongoose.Schema.Types.ObjectId }, 
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, 
  isRead: { type: Boolean, default: false },
  source: { type: String }, // 👈 WHO / NCDC
  link: { type: String },   // 👈 external URL to read more
  createdAt: { type: Date, default: Date.now },
});


module.exports = mongoose.model("Notification", notificationSchema);