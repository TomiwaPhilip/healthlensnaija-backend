// // backend/src/utils/initQdrant.js
// const qdrant = require('./qdrant');

// async function initQdrant() {
//   const collections = await qdrant.getCollections();

//   if (!collections.collections.find(c => c.name === 'nhw-embeddings')) {
//     await qdrant.createCollection('nhw-embeddings', {
//       vectors: { size: 1536, distance: 'Cosine' }
//     });
//     console.log("✅ Qdrant collection created: nhw-embeddings");
//   } else {
//     console.log("✅ Qdrant collection exists.");
//   }
// }

// module.exports = initQdrant;
