const storyService = require("../services/newsroomStoryService");

function handleError(res, error) {
  const isNotFound = /not found/i.test(error.message);
  const status = isNotFound ? 404 : 400;
  return res.status(status).json({ message: error.message });
}

async function listStories(req, res) {
  try {
    const stories = storyService.listStories(req.query.q || "");
    res.json(stories);
  } catch (error) {
    console.error("listStories error", error);
    res.status(500).json({ message: "Failed to load stories" });
  }
}

async function createStory(req, res) {
  try {
    const story = storyService.createStory(req.body);
    res.status(201).json(story);
  } catch (error) {
    handleError(res, error);
  }
}

async function getStory(req, res) {
  try {
    const story = storyService.getStoryById(req.params.storyId);
    if (!story) {
      return res.status(404).json({ message: "Story not found" });
    }
    res.json(story);
  } catch (error) {
    console.error("getStory error", error);
    res.status(500).json({ message: "Failed to fetch story" });
  }
}

async function deleteStory(req, res) {
  try {
    const deleted = storyService.deleteStory(req.params.storyId);
    if (!deleted) {
      return res.status(404).json({ message: "Story not found" });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("deleteStory error", error);
    res.status(500).json({ message: "Failed to delete story" });
  }
}

module.exports = {
  listStories,
  createStory,
  getStory,
  deleteStory,
};
