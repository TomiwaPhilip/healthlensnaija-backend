const mongoose = require("mongoose");
const NewsroomMessage = require("../models/NewsroomMessage");
const NewsroomArtifact = require("../models/NewsroomArtifact");
const NewsroomSource = require("../models/NewsroomSource");
const {
  getStoryById,
  refreshStoryPreview,
} = require("./newsroomStoryService");
const { generateAssistantReply } = require("./newsroomAgentService");

const CHAT_HISTORY_LIMIT = Number(process.env.AGENT_CHAT_HISTORY_LIMIT) || 6;
const HISTORY_SNIPPET_LIMIT = Number(process.env.AGENT_HISTORY_SNIPPET_LIMIT) || 220;


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
      .limit(3)
      .lean(),
    NewsroomSource.find({ story: storyId })
      .sort({ createdAt: -1 })
      .limit(3)
      .lean(),
  ]);

  const artifactSection = artifacts
    .map((artifact, index) => {
      const content = artifact.content || "";
      const snippet = content.slice(0, 220).replace(/\s+/g, " ");
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

async function getRecentChatMessages(storyId, limit = CHAT_HISTORY_LIMIT) {
  const docs = await NewsroomMessage.find({ story: storyId })
    .sort({ timestamp: -1 })
    .limit(Math.max(1, limit))
    .lean();
  return docs.reverse();
}

function formatHistoryForAgent(messages = []) {
  if (!messages.length) {
    return "No prior conversation yet.";
  }

  return messages.map((message, index) => {
    const role = (message.role || "user").toUpperCase();
    const snippet = (message.content || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, HISTORY_SNIPPET_LIMIT);
    return `${index + 1}. ${role}: ${snippet}`;
  }).join("\n");
}



async function sendMessage(storyId, content, options = {}) {
  if (!content || !content.trim()) {
    throw new Error("Message content is required");
  }

  const story = await ensureStoryExists(storyId);
  const trimmedContent = content.trim();

  const [contextSummary, priorHistory] = await Promise.all([
    buildContextSummary(storyId),
    getRecentChatMessages(storyId, CHAT_HISTORY_LIMIT),
  ]);

  const historyForAgent = [...priorHistory, { role: "user", content: trimmedContent }];
  const chatHistorySummary = formatHistoryForAgent(historyForAgent);

  const userPayload = {
    story: storyId,
    role: "user",
    content: trimmedContent,
    timestamp: new Date(),
  };

  let assistantText;
  try {
    const response = await generateAssistantReply({
      story,
      prompt: trimmedContent,
      contextSummary,
      chatHistorySummary,
      onToken: options.onToken,
      onStatus: options.onStatus,
      sourcesOnly: Boolean(options.sourcesOnly),
      researchMode: options.researchMode,
    });
    assistantText = response.text;
    if (!assistantText) {
      console.error("generateAssistantReply returned empty text");
      throw new Error("Model returned an empty response — please try again.");
    }
  } catch (agentError) {
    console.error("newsroomAgent error:", agentError.message, agentError.stack);
    throw agentError;
  }

  // Save both messages after model responds — keeps the streaming path fast
  const [userMessage, assistantMessage] = await Promise.all([
    NewsroomMessage.create(userPayload),
    NewsroomMessage.create({
      story: storyId,
      role: "assistant",
      content: assistantText,
      timestamp: new Date(),
    }),
  ]);

  refreshStoryPreview(storyId).catch((err) =>
    console.error("refreshStoryPreview error", err)
  );

  return {
    userMessage: userMessage.toObject(),
    assistantMessage: assistantMessage.toObject(),
  };
}

module.exports = {
  getChatHistory,
  sendMessage,
};
