// // routes/openSearchRoutes.js
// const express = require("express");
// const router = express.Router();
// const client = require("../config/opensearch");



// // Search API
// router.get('/search', async (req, res) => {
//   const { query } = req.query;

//   try {
//     const response = await client.search({
//       index: 'stories',
//       body: {
//         query: {
//           multi_match: {
//             query,
//             fields: ['title', 'content', 'tags'],
//           },
//         },
//       },
//     });

//     const results = response.body.hits.hits.map((hit) => ({
//       id: hit._id,
//       ...hit._source,
//     }));

//     res.status(200).json(results);
//   } catch (error) {
//     console.error('Search error:', error.message);
//     res.status(500).json({ message: 'Search failed', error: error.message });
//   }
// });

// module.exports = router;
