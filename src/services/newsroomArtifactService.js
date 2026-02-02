const mongoose = require("mongoose");
const NewsroomArtifact = require("../models/NewsroomArtifact");
const { getStoryById, refreshStoryPreview } = require("./newsroomStoryService");

async function ensureStory(storyId) {
  const story = await getStoryById(storyId);
  if (!story) {
    throw new Error("Story not found");
  }
  return story;
}

async function listArtifacts(storyId) {
  await ensureStory(storyId);
  return NewsroomArtifact.find({ story: storyId }).sort({ createdAt: -1 }).lean();
}

async function createArtifact(storyId, payload = {}) {
  await ensureStory(storyId);
  if (!payload.title || !payload.content) {
    throw new Error("Artifact title and content are required");
  }

  const artifact = await NewsroomArtifact.create({
    story: storyId,
    title: payload.title.trim(),
    type: payload.type || "story",
    content: payload.content,
  });

  await refreshStoryPreview(storyId);
  return artifact.toObject();
}

async function getArtifactById(artifactId) {
  if (!mongoose.Types.ObjectId.isValid(artifactId)) {
    return null;
  }
  return NewsroomArtifact.findById(artifactId);
}

async function updateArtifact(artifactId, payload = {}) {
  const artifact = await getArtifactById(artifactId);
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

  await artifact.save();
  await refreshStoryPreview(artifact.story.toString());
  return artifact.toObject();
}

async function deleteArtifact(artifactId) {
  const artifact = await getArtifactById(artifactId);
  if (!artifact) {
    return null;
  }

  await artifact.deleteOne();
  await refreshStoryPreview(artifact.story.toString());
  return artifact.toObject();
}

async function exportArtifact(artifactId, format = "pdf") {
  const artifact = await getArtifactById(artifactId);
  if (!artifact) {
    throw new Error("Artifact not found");
  }

  const normalizedFormat = format === "docx" ? "docx" : "pdf";
  return {
    filename: `${artifact.title.replace(/\s+/g, "_")}.${normalizedFormat}`,
    mimeType:
      normalizedFormat === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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
