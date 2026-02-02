const mongoose = require("mongoose");
const NewsroomMessage = require("../models/NewsroomMessage");
const NewsroomArtifact = require("../models/NewsroomArtifact");
const NewsroomSource = require("../models/NewsroomSource");
const {
  getStoryById,
  refreshStoryPreview,
} = require("./newsroomStoryService");
const { generateAssistantReply } = require("./newsroomAgentService");

const CHAT_HISTORY_LIMIT = Number(process.env.AGENT_CHAT_HISTORY_LIMIT) || 10;
const HISTORY_SNIPPET_LIMIT = Number(process.env.AGENT_HISTORY_SNIPPET_LIMIT) || 360;
const GREETING_REGEX = /^(hi|hello|hey|good (morning|afternoon|evening)|what's up|whats up|sup)\b/i;
const OUT_OF_SCOPE_KEYWORDS = [
  "joke",
  "weather",
  "song",
  "poem",
  "recipe",
  "code",
  "game",
  "play",
  "gossip",
  "chat",
  "small talk",
];

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

function detectScopeViolation(content = "") {
  const normalized = content.trim();
  if (!normalized) {
    return "I only respond to newsroom tasks tied to this investigation. Please provide a concrete reporting request.";
  }

  if (GREETING_REGEX.test(normalized) && normalized.split(/\s+/).length <= 12) {
    return "Let's stay focused on the investigation. Share the reporting task or question you need help with.";
  }

  const lower = normalized.toLowerCase();
  if (OUT_OF_SCOPE_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return "I'm restricted to investigative workflow support—please provide a story-specific request.";
  }

  return null;
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

  const userMessage = await NewsroomMessage.create(userPayload);

  let assistantText;
  const scopeViolation = detectScopeViolation(trimmedContent);

  if (scopeViolation) {
    if (typeof options.onToken === "function") {
      await options.onToken(scopeViolation);
    }
    assistantText = scopeViolation;
  } else {
    try {
      const response = await generateAssistantReply({
        story,
        prompt: trimmedContent,
        contextSummary,
        chatHistorySummary,
        onToken: options.onToken,
      });
      assistantText = response.text || buildAssistantReply(trimmedContent);
    } catch (agentError) {
      console.error("newsroomAgent error", agentError);
      assistantText = buildAssistantReply(trimmedContent);
    }
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
