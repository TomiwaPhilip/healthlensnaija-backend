const storyService = require("../services/newsroomStoryService");

function handleError(res, error) {
  const isNotFound = /not found/i.test(error.message);
  const status = isNotFound ? 404 : 400;
  return res.status(status).json({ message: error.message });
}

async function listStories(req, res) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const { q = "", page = "1", limit = "12" } = req.query;
    const stories = await storyService.listStories({
      ownerId: req.user.id,
      searchTerm: q,
      page: Number(page),
      limit: Number(limit),
    });
    res.json(stories);
  } catch (error) {
    console.error("listStories error", error);
    res.status(500).json({ message: "Failed to load stories" });
  }
}

async function createStory(req, res) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const story = await storyService.createStory(req.body, req.user.id);
    res.status(201).json(story);
  } catch (error) {
    handleError(res, error);
  }
}

async function getStory(req, res) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const story = await storyService.getStoryWithRelations(
      req.params.storyId,
      req.user.id
    );
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
    if (!req.user?.id) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const deleted = await storyService.deleteStory(req.params.storyId, req.user.id);
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
