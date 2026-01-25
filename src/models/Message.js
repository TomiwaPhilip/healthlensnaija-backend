const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  chatId: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", required: true },
  user: { type: String, enum: ["You", "Healthlens Naija"], required: true },
  text: { type: String, required: true },
  
  parentMessage: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
  children: [{ type: mongoose.Schema.Types.ObjectId, ref: "Message" }],

  parentVersion: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
  versions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Message" }],

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Message", messageSchema);
