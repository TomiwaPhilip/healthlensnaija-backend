const { store, generateId } = require("../utils/newsroomStore");
const { getStoryById, refreshStoryPreview } = require("./newsroomStoryService");

function listArtifacts(storyId) {
  if (!getStoryById(storyId)) {
    throw new Error("Story not found");
  }

  return store.artifacts.filter((artifact) => artifact.story_id === storyId);
}

function createArtifact(storyId, payload = {}) {
  if (!getStoryById(storyId)) {
    throw new Error("Story not found");
  }

  if (!payload.title || !payload.content) {
    throw new Error("Artifact title and content are required");
  }

  const now = new Date().toISOString();
  const artifact = {
    id: generateId("artifact"),
    story_id: storyId,
    title: payload.title.trim(),
    type: payload.type || "story",
    content: payload.content,
    created_at: now,
    updated_at: now,
  };

  store.artifacts.push(artifact);
  refreshStoryPreview(storyId);
  return artifact;
}

function getArtifactById(artifactId) {
  return store.artifacts.find((artifact) => artifact.id === artifactId);
}

function updateArtifact(artifactId, payload = {}) {
  const artifact = getArtifactById(artifactId);
  if (!artifact) {
    throw new Error("Artifact not found");
  }

  if (payload.title) {
    artifact.title = payload.title.trim();
  }
  if (payload.type) {
    artifact.type = payload.type;
  }
  if (payload.content) {
    artifact.content = payload.content;
  }

  artifact.updated_at = new Date().toISOString();
  refreshStoryPreview(artifact.story_id);
  return artifact;
}

function deleteArtifact(artifactId) {
  const index = store.artifacts.findIndex((artifact) => artifact.id === artifactId);
  if (index === -1) {
    return null;
  }

  const [removed] = store.artifacts.splice(index, 1);
  refreshStoryPreview(removed.story_id);
  return removed;
}

function exportArtifact(artifactId, format = "pdf") {
  const artifact = getArtifactById(artifactId);
  if (!artifact) {
    throw new Error("Artifact not found");
  }

  const normalizedFormat = format === "docx" ? "docx" : "pdf";
  return {
    filename: `${artifact.title.replace(/\s+/g, "_")}.${normalizedFormat}`,
    mimeType:
      normalizedFormat === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    content: Buffer.from(artifact.content, "utf8"),
  };
}

module.exports = {
  listArtifacts,
  createArtifact,
  updateArtifact,
  deleteArtifact,
  exportArtifact,
};
