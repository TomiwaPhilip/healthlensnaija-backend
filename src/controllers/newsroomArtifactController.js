const artifactService = require("../services/newsroomArtifactService");

function handleError(res, error) {
  if (/not found/i.test(error.message)) {
    return res.status(404).json({ message: error.message });
  }
  return res.status(400).json({ message: error.message });
}

async function listArtifacts(req, res) {
  try {
    const artifacts = artifactService.listArtifacts(req.params.storyId);
    res.json(artifacts);
  } catch (error) {
    handleError(res, error);
  }
}

async function createArtifact(req, res) {
  try {
    const artifact = artifactService.createArtifact(req.params.storyId, req.body);
    res.status(201).json(artifact);
  } catch (error) {
    handleError(res, error);
  }
}

async function updateArtifact(req, res) {
  try {
    const updated = artifactService.updateArtifact(req.params.artifactId, req.body);
    res.json(updated);
  } catch (error) {
    handleError(res, error);
  }
}

async function deleteArtifact(req, res) {
  try {
    const removed = artifactService.deleteArtifact(req.params.artifactId);
    if (!removed) {
      return res.status(404).json({ message: "Artifact not found" });
    }
    res.json({ success: true });
  } catch (error) {
    handleError(res, error);
  }
}

async function exportArtifact(req, res) {
  try {
    const format = req.body?.format || "pdf";
    const resource = artifactService.exportArtifact(req.params.artifactId, format);
    res.setHeader("Content-Type", resource.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${resource.filename}"`);
    res.send(resource.content);
  } catch (error) {
    handleError(res, error);
  }
}

module.exports = {
  listArtifacts,
  createArtifact,
  updateArtifact,
  deleteArtifact,
  exportArtifact,
};
