// // controllers/storyController.js
// const { addStory, getStories, updateStory, deleteStory } = require("../services/storyService");

// const createStory = async (req, res, next) => {
//   try {
//     const { title, content, tags, userId } = req.body;
//     const story = await addStory({ title, content, tags, generatedBy: userId });
//     res.status(201).json({ message: "Story added", story });
//   } catch (error) {
//     next(error);
//   }
// };

// const getAllStories = async (req, res, next) => {
//   try {
//     const stories = await getStories();
//     res.status(200).json(stories);
//   } catch (error) {
//     next(error);
//   }
// };

// const updateStoryHandler = async (req, res, next) => {
//   try {
//     const updatedStory = await updateStory(req.params.id, req.body);
//     res.status(200).json({ message: "Story updated", story: updatedStory });
//   } catch (error) {
//     next(error);
//   }
// };

// const deleteStoryHandler = async (req, res, next) => {
//   try {
//     await deleteStory(req.params.id);
//     res.status(200).json({ message: "Story deleted" });
//   } catch (error) {
//     next(error);
//   }
// };

// module.exports = { createStory, getAllStories, updateStoryHandler, deleteStoryHandler };
