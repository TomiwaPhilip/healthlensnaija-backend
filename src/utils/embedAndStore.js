//src/utils/embedAndStore.js
const EmbeddedContent = require("../models/EmbeddedContent");
const axios = require("axios");

async function embedText(text) {
  const resp = await axios.post("https://api.openai.com/v1/embeddings", {
    input: text,
    model: "text-embedding-ada-002"
  }, {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
  });
  return resp.data.data[0].embedding;
}

async function storeEmbeddedContent(content, metadata = {}) {
  const embedding = await embedText(content);
  const doc = new EmbeddedContent({ content, embedding, metadata });
  return doc.save();
}

module.exports = { storeEmbeddedContent };
