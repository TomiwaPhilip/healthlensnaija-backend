// // services/storyService.js
// const Story = require("../models/Story");

// const addStory = async (storyData) => {
//   const story = new Story(storyData);
//   return await story.save();
// };

// const getStories = async () => {
//   return await Story.find();
// };

// const updateStory = async (id, updateData) => {
//   const story = await Story.findById(id);
//   if (!story) throw new Error("Story not found");
  
//   // Save previous version before updating
//   story.versions.push({ content: story.content, updatedAt: new Date() });
  
//   // Update the story with the new data
//   Object.assign(story, updateData);
//   return await story.save();
// };

// const deleteStory = async (id) => {
//   return await Story.findByIdAndDelete(id);
// };

// module.exports = { addStory, getStories, updateStory, deleteStory };
