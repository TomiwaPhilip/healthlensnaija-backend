const { streamText, tool } = require("ai");
const { z } = require("zod");
const { searchSourceText } = require("./newsroomSourceService");
const { getOpenAIClient } = require("./aiClient");

const DEFAULT_MODEL = "gpt-5-mini-2025-08-07";
const DEFAULT_TEMPERATURE = 0.2;

function buildSystemPrompt(story, contextSummary) {
  const metadata = story.metadata || {};
  const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
  const sections = [
    "You are HealthLens Newsroom AI, a meticulous assistant for investigative journalists.",
    "Blend structured analysis with empathetic tone. Cite facts from provided context.",
    "TOOLS: You have exclusive access to the `search_sources` tool, which queries the Pinecone namespace for this story. Always call it before drafting and whenever you need more evidence. Continue searching until you have enough verbatim facts.",
    "Never fabricate information. Every assertion must reference retrieved passages (include filename or URL and page when available). If the library lacks answers, explain what is missing and request follow-up ingestion.",
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

function buildSearchTool(storyId) {
  return tool({
    description:
      "Search the Pinecone knowledge base for this story to retrieve ground-truth passages, quotes, and metadata. Use this before composing any narrative.",
    parameters: z.object({
      query: z.string().min(3, "Query text is required"),
      topK: z.number().int().min(1).max(20).optional(),
      fields: z.array(z.string()).max(6).optional(),
    }),
    execute: async ({ query, topK, fields }) => {
      const response = await searchSourceText(storyId, query, {
        topK,
        fields,
      });

      return {
        namespace: response.namespace,
        usage: response.usage,
        hits: response?.result?.hits ?? [],
      };
    },
  });
}

async function generateAssistantReply({ story, prompt, contextSummary }) {
  if (!story) {
    throw new Error("Story context is required for agent replies");
  }

  const storyId = story._id?.toString();
  if (!storyId) {
    throw new Error("Story id is required for agent search tools");
  }

  const openai = getOpenAIClient();
  const modelName = process.env.NEWSROOM_MODEL || DEFAULT_MODEL;
  const maxSteps = Number(process.env.AGENT_MAX_TOOL_STEPS) || 6;

  const result = await streamText({
    model: openai(modelName),
    temperature: DEFAULT_TEMPERATURE,
    system: buildSystemPrompt(story, contextSummary),
    prompt,
    tools: {
      search_sources: buildSearchTool(storyId),
    },
    maxSteps,
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
