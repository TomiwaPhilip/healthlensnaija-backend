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

function ensureObjectId(id) {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return null;
  }
  return new mongoose.Types.ObjectId(id);
}

function toStoryResponse(doc = {}) {
  if (!doc) {
    return null;
  }

  return {
    id: doc._id?.toString(),
    title: doc.title,
    status: doc.status,
    preview_text: doc.preview_text,
    metadata: doc.metadata || {},
    owner: doc.owner?.toString?.() || doc.owner,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function listStories({
  ownerId,
  searchTerm = "",
  page = 1,
  limit = 12,
} = {}) {
  const ownerObjectId = ensureObjectId(ownerId);
  if (!ownerObjectId) {
    throw new Error("Owner id is required to fetch stories");
  }

  const filter = {
    owner: ownerObjectId,
    ...buildSearchFilter(searchTerm),
  };

  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 12));
  const safePage = Math.max(1, Number(page) || 1);
  const skip = (safePage - 1) * safeLimit;

  const [total, rows] = await Promise.all([
    NewsroomStory.countDocuments(filter),
    NewsroomStory.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
  ]);

  const stories = rows.map(toStoryResponse);
  const hasMore = skip + stories.length < total;

  return {
    stories,
    page: safePage,
    limit: safeLimit,
    total,
    hasMore,
  };
}

async function createStory(payload = {}, ownerId) {
  const ownerObjectId = ensureObjectId(ownerId);
  if (!ownerObjectId) {
    throw new Error("Owner id is required to create a story");
  }

  if (!payload.title || !payload.title.trim()) {
    throw new Error("Title is required to start a story workspace");
  }

  const story = await NewsroomStory.create({
    title: payload.title.trim(),
    status: payload.status || "draft",
    preview_text: payload.preview_text || "",
    owner: ownerObjectId,
    metadata: {
      tags: normalizeTags(payload?.metadata?.tags),
      region: payload?.metadata?.region || "",
    },
  });

  return toStoryResponse(story.toObject());
}

async function getStoryById(storyId) {
  if (!mongoose.Types.ObjectId.isValid(storyId)) {
    return null;
  }
  return NewsroomStory.findById(storyId);
}

async function getStoryWithRelations(storyId, ownerId) {
  if (!mongoose.Types.ObjectId.isValid(storyId)) {
    return null;
  }

  const filter = { _id: storyId };
  if (ownerId) {
    const ownerObjectId = ensureObjectId(ownerId);
    if (!ownerObjectId) {
      return null;
    }
    filter.owner = ownerObjectId;
  }

  const story = await NewsroomStory.findOne(filter).lean();
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

async function deleteStory(storyId, ownerId) {
  if (!mongoose.Types.ObjectId.isValid(storyId)) {
    return null;
  }

  const ownerObjectId = ensureObjectId(ownerId);
  if (!ownerObjectId) {
    return null;
  }

  const story = await NewsroomStory.findOneAndDelete({
    _id: storyId,
    owner: ownerObjectId,
  });
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
