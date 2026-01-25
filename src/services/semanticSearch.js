// services/semanticSearch.js
const axios = require("axios");
const { vectorSearch } = require("./vectorSearch");

async function searchRelevantChunks(question, topK = 5) {
  const resp = await axios.post("https://api.openai.com/v1/embeddings", {
    input: question,
    model: "text-embedding-ada-002"
  }, {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
  });
  const queryEmbedding = resp.data.data[0].embedding;

  const hits = await vectorSearch(queryEmbedding, topK);
  return hits.map(hit => hit.content);
}

module.exports = searchRelevantChunks;
