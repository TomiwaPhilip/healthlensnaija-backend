const mongoose = require("mongoose");

const tagSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  slug: { type: String, required: true, unique: true },
  synonyms: [String],
  usageCount: { type: Number, default: 0 },
});

module.exports = mongoose.model("Tag", tagSchema);
