// backend/src/utils/pineconeIndex.js
const pinecone = require('./pinecone');

// For serverless mode, we directly return the index by name
async function getIndex(indexName) {
  return pinecone.Index(indexName); // No need to list/create
}

module.exports = { getIndex };
