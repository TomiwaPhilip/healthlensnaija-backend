// services/vectorSearch.js
const mongoose = require("mongoose");

async function vectorSearch(queryEmbedding, topK = 5) {
  const coll = mongoose.connection.collection("embeddedcontents"); // ensure correct collection name

  const pipeline = [
    {
      $vectorSearch: {
        index: "default",               // your index name in Atlas
        path: "embedding",
        queryVector: queryEmbedding,
        limit: topK,
        numCandidates: Math.min(100, topK * 20)
      }
    },
    {
      $project: {
        content: 1,
        metadata: 1,
        score: { $meta: "vectorSearchScore" }
      }
    }
  ];

  return coll.aggregate(pipeline).toArray();
}

module.exports = { vectorSearch };
