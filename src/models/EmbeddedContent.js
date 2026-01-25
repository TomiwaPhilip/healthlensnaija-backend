const mongoose = require('mongoose');

const EmbeddedSchema = new mongoose.Schema({
  content: { type: String, required: true },
  embedding: { type: [Number], required: true }, // float embeddings
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
});

module.exports = mongoose.model('EmbeddedContent', EmbeddedSchema);
