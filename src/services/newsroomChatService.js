const { store, generateId } = require("../utils/newsroomStore");
const { getStoryById, refreshStoryPreview } = require("./newsroomStoryService");

function getChatHistory(storyId, limit = 50) {
  if (!getStoryById(storyId)) {
    throw new Error("Story not found");
  }

  const sanitizedLimit = Number.isFinite(limit) && limit > 0 ? limit : 50;

  return store.messages
    .filter((message) => message.story_id === storyId)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .slice(-sanitizedLimit);
}

function buildAssistantReply(userContent) {
  const base =
    "This is a placeholder response from the newsroom assistant. Updated AI hooks will replace this soon.";
  return `${base} You said: ${userContent.slice(0, 200)}...`;
}

function sendMessage(storyId, content) {
  const story = getStoryById(storyId);
  if (!story) {
    throw new Error("Story not found");
  }

  if (!content || !content.trim()) {
    throw new Error("Message content is required");
  }

  const userTimestamp = new Date().toISOString();
  const userMessage = {
    id: generateId("msg"),
    story_id: storyId,
    role: "user",
    content: content.trim(),
    timestamp: userTimestamp,
  };

  const assistantMessage = {
    id: generateId("msg"),
    story_id: storyId,
    role: "assistant",
    content: buildAssistantReply(content.trim()),
    timestamp: new Date().toISOString(),
  };

  store.messages.push(userMessage, assistantMessage);
  refreshStoryPreview(storyId);

  return { userMessage, assistantMessage };
}

module.exports = {
  getChatHistory,
  sendMessage,
};
