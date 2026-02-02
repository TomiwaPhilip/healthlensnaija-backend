const mongoose = require("mongoose");
const NewsroomMessage = require("../models/NewsroomMessage");
const {
  getStoryById,
  refreshStoryPreview,
} = require("./newsroomStoryService");

function buildAssistantReply(userContent) {
  const base =
    "This is a placeholder response from the newsroom assistant. Updated AI hooks will replace this soon.";
  return `${base} You said: ${userContent.slice(0, 200)}...`;
}

async function ensureStoryExists(storyId) {
  const story = await getStoryById(storyId);
  if (!story) {
    throw new Error("Story not found");
  }
  return story;
}

async function getChatHistory(storyId, limit = 50) {
  if (!mongoose.Types.ObjectId.isValid(storyId)) {
    throw new Error("Story not found");
  }
  await ensureStoryExists(storyId);

  const sanitizedLimit = Number.isFinite(limit) && limit > 0 ? limit : 50;
  return NewsroomMessage.find({ story: storyId })
    .sort({ timestamp: 1 })
    .limit(sanitizedLimit)
    .lean();
}

async function sendMessage(storyId, content) {
  if (!content || !content.trim()) {
    throw new Error("Message content is required");
  }

  await ensureStoryExists(storyId);

  const userPayload = {
    story: storyId,
    role: "user",
    content: content.trim(),
    timestamp: new Date(),
  };

  const assistantPayload = {
    story: storyId,
    role: "assistant",
    content: buildAssistantReply(content.trim()),
    timestamp: new Date(),
  };

  const [userMessage, assistantMessage] = await NewsroomMessage.insertMany(
    [userPayload, assistantPayload],
    { ordered: true }
  );

  await refreshStoryPreview(storyId);

  return {
    userMessage: userMessage.toObject(),
    assistantMessage: assistantMessage.toObject(),
  };
}

module.exports = {
  getChatHistory,
  sendMessage,
};
