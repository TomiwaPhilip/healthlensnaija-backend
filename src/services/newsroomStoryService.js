const mongoose = require("mongoose");
const NewsroomStory = require("../models/NewsroomStory");
const NewsroomArtifact = require("../models/NewsroomArtifact");
const NewsroomMessage = require("../models/NewsroomMessage");
const NewsroomSource = require("../models/NewsroomSource");

function normalizeTags(rawTags) {
  if (!Array.isArray(rawTags)) {
    return [];
  }
  return rawTags.filter(Boolean);
}

function buildSearchFilter(searchTerm = "") {
  const trimmed = searchTerm.trim();
  if (!trimmed) {
    return {};
  }

  const regex = new RegExp(trimmed, "i");
  return {
    $or: [{ title: regex }, { "metadata.tags": regex }],
  };
}

async function listStories(searchTerm = "") {
  const filter = buildSearchFilter(searchTerm);
  const stories = await NewsroomStory.find(filter)
    .sort({ updatedAt: -1 })
    .lean();
  return stories;
}

async function createStory(payload = {}) {
  if (!payload.title || !payload.title.trim()) {
    throw new Error("Title is required to start a story workspace");
  }

  const story = await NewsroomStory.create({
    title: payload.title.trim(),
    status: payload.status || "draft",
    preview_text: payload.preview_text || "",
    metadata: {
      tags: normalizeTags(payload?.metadata?.tags),
      region: payload?.metadata?.region || "",
    },
  });

  return story.toObject();
}

async function getStoryById(storyId) {
  if (!mongoose.Types.ObjectId.isValid(storyId)) {
    return null;
  }
  return NewsroomStory.findById(storyId);
}

async function getStoryWithRelations(storyId) {
  if (!mongoose.Types.ObjectId.isValid(storyId)) {
    return null;
  }

  const story = await NewsroomStory.findById(storyId).lean();
  if (!story) {
    return null;
  }

  const [artifacts, chat, sources] = await Promise.all([
    NewsroomArtifact.find({ story: storyId }).sort({ createdAt: -1 }).lean(),
    NewsroomMessage.find({ story: storyId })
      .sort({ timestamp: 1 })
      .lean(),
    NewsroomSource.find({ story: storyId }).sort({ createdAt: -1 }).lean(),
  ]);

  return { ...story, artifacts, chat, sources };
}

async function deleteStory(storyId) {
  if (!mongoose.Types.ObjectId.isValid(storyId)) {
    return null;
  }

  const story = await NewsroomStory.findByIdAndDelete(storyId);
  if (!story) {
    return null;
  }

  await Promise.all([
    NewsroomArtifact.deleteMany({ story: storyId }),
    NewsroomMessage.deleteMany({ story: storyId }),
    NewsroomSource.deleteMany({ story: storyId }),
  ]);

  return story;
}

async function refreshStoryPreview(storyId) {
  if (!mongoose.Types.ObjectId.isValid(storyId)) {
    return;
  }

  const [latestArtifact, latestMessage] = await Promise.all([
    NewsroomArtifact.findOne({ story: storyId })
      .sort({ updatedAt: -1 })
      .lean(),
    NewsroomMessage.findOne({ story: storyId })
      .sort({ timestamp: -1 })
      .lean(),
  ]);

  const previewSource = latestArtifact?.content || latestMessage?.content || "";
  await NewsroomStory.findByIdAndUpdate(storyId, {
    preview_text: previewSource.slice(0, 280),
  });
}

module.exports = {
  listStories,
  createStory,
  getStoryById,
  getStoryWithRelations,
  deleteStory,
  refreshStoryPreview,
};
