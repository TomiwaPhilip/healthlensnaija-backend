const mongoose = require("mongoose");

const ReplySchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
  adminName: { type: String, required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const ContactMessageSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  message: { type: String, required: true },
  read: { type: Boolean, default: false },
  replied: { type: Boolean, default: false },
  replies: { type: [ReplySchema], default: [] },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("ContactMessage", ContactMessageSchema);
