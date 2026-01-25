// const { EventEmitter } = require("events");
// const client = require("../config/opensearch");

// const eventEmitter = new EventEmitter();

// // Event listener for syncing to OpenSearch
// eventEmitter.on("syncToOpenSearch", async (story) => {
//   try {
//     await client.index({
//       index: "stories",
//       id: story._id.toString(),
//       body: {
//         title: story.title,
//         content: story.content,
//         tags: story.tags,
//         createdAt: story.createdAt,
//       },
//     });
//     console.log(`Story synced to OpenSearch: ${story.title}`);
//   } catch (error) {
//     console.error("Error syncing to OpenSearch:", error.message);
//   }
// });

// // Event listener for removing from OpenSearch
// eventEmitter.on("removeFromOpenSearch", async (storyId) => {
//   try {
//     await client.delete({
//       index: "stories",
//       id: storyId.toString(),
//     });
//     console.log(`Story removed from OpenSearch: ${storyId}`);
//   } catch (error) {
//     console.error("Error removing from OpenSearch:", error.message);
//   }
// });

// module.exports = eventEmitter;
