const mongoose = require("mongoose");
const NewsroomMessage = require("../models/NewsroomMessage");
const NewsroomArtifact = require("../models/NewsroomArtifact");
const NewsroomSource = require("../models/NewsroomSource");
const {
  getStoryById,
  refreshStoryPreview,
} = require("./newsroomStoryService");
const { generateAssistantReply } = require("./newsroomAgentService");

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

async function buildContextSummary(storyId) {
  const [artifacts, sources] = await Promise.all([
    NewsroomArtifact.find({ story: storyId })
      .sort({ updatedAt: -1 })
      .limit(5)
      .lean(),
    NewsroomSource.find({ story: storyId })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
  ]);

  const artifactSection = artifacts
    .map((artifact, index) => {
      const content = artifact.content || "";
      const snippet = content.slice(0, 400).replace(/\s+/g, " ");
      return `${index + 1}. ${artifact.title} (${artifact.type})\n${snippet}`;
    })
    .join("\n\n");

  const sourceSection = sources
    .map((source, index) => `${index + 1}. ${source.filename} [${source.vector_status}]`)
    .join("\n");

  return [
    artifactSection ? `Artifacts (latest):\n${artifactSection}` : "No artifacts yet.",
    sourceSection ? `Sources (latest uploads):\n${sourceSection}` : "No sources uploaded.",
  ].join("\n\n");
}

async function sendMessage(storyId, content) {
  if (!content || !content.trim()) {
    throw new Error("Message content is required");
  }

  const story = await ensureStoryExists(storyId);

  const userPayload = {
    story: storyId,
    role: "user",
    content: content.trim(),
    timestamp: new Date(),
  };

  const userMessage = await NewsroomMessage.create(userPayload);

  let assistantText;
  try {
    const contextSummary = await buildContextSummary(storyId);
    const response = await generateAssistantReply({
      story,
      prompt: content.trim(),
      contextSummary,
    });
    assistantText = response.text || buildAssistantReply(content.trim());
  } catch (agentError) {
    console.error("newsroomAgent error", agentError);
    assistantText = buildAssistantReply(content.trim());
  }

  const assistantMessage = await NewsroomMessage.create({
    story: storyId,
    role: "assistant",
    content: assistantText,
    timestamp: new Date(),
  });

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
