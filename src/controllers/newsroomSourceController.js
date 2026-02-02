const sourceService = require("../services/newsroomSourceService");

function handleError(res, error) {
  if (/not found/i.test(error.message)) {
    return res.status(404).json({ message: error.message });
  }
  return res.status(400).json({ message: error.message });
}

async function listSources(req, res) {
  try {
    const sources = sourceService.listSources(req.params.storyId);
    res.json(sources);
  } catch (error) {
    handleError(res, error);
  }
}

async function createSource(req, res) {
  try {
    const created = sourceService.createSource(req.params.storyId, req.file);
    res.status(201).json(created);
  } catch (error) {
    handleError(res, error);
  }
}

async function deleteSource(req, res) {
  try {
    const removed = sourceService.deleteSource(req.params.sourceId);
    if (!removed) {
      return res.status(404).json({ message: "Source not found" });
    }
    res.json({ success: true });
  } catch (error) {
    handleError(res, error);
  }
}

module.exports = {
  listSources,
  createSource,
  deleteSource,
};
