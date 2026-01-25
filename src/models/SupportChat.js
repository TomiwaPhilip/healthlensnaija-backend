const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema(
  {
    user: { type: String, enum: ["user", "agent", "ai", "system"], required: true },
    text: { type: String, required: true },
    meta: { type: Object, default: {} },
  },
  { _id: false, timestamps: true }
);

const SupportChatSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "BaseUser", required: true },
    subject: { type: String },
    status: { type: String, enum: ["open", "pending", "resolved", "closed"], default: "open" },
    priority: { type: String, enum: ["low", "normal", "high"], default: "normal" },
    messages: [MessageSchema],
    lastMessageAt: { type: Date, default: Date.now },
    lastNotifiedAt: { type: Date },
  },
  { timestamps: true }
);

SupportChatSchema.index({ userId: 1, updatedAt: -1 });

module.exports = mongoose.model("SupportChat", SupportChatSchema);
