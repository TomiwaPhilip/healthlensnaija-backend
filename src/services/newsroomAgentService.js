const { streamText } = require("ai");
const { getOpenAIClient } = require("./aiClient");

const DEFAULT_MODEL = "gpt-5-mini-2025-08-07";
const DEFAULT_TEMPERATURE = 0.2;

function buildSystemPrompt(story, contextSummary) {
  const metadata = story.metadata || {};
  const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
  const sections = [
    "You are HealthLens Newsroom AI, a meticulous assistant for investigative journalists.",
    "Blend structured analysis with empathetic tone. Cite facts from provided context.",
    `Story Title: ${story.title}`,
    `Status: ${story.status}`,
    tags.length ? `Tags: ${tags.join(", ")}` : null,
    metadata.region ? `Region: ${metadata.region}` : null,
    metadata.brief ? `Story Brief: ${metadata.brief}` : null,
    "Context Bundle:\n" + (contextSummary || "No extra context provided."),
    "When data is missing, describe the gap and propose next investigative steps.",
  ].filter(Boolean);

  return sections.join("\n\n");
}

async function generateAssistantReply({ story, prompt, contextSummary }) {
  if (!story) {
    throw new Error("Story context is required for agent replies");
  }

  const openai = getOpenAIClient();
  const modelName = process.env.NEWSROOM_MODEL || DEFAULT_MODEL;

  const result = await streamText({
    model: openai(modelName),
    temperature: DEFAULT_TEMPERATURE,
    system: buildSystemPrompt(story, contextSummary),
    prompt,
  });

  let text = "";
  for await (const delta of result.textStream) {
    text += delta;
  }

  return {
    text: text.trim(),
    finishReason: result.finishReason,
  };
}

module.exports = {
  generateAssistantReply,
};
