const { streamText, tool } = require("ai");
const { z } = require("zod");
const {
  searchSourceText,
  upsertSourceText,
} = require("./newsroomSourceService");
const {
  searchWeb,
  extractWebContent,
  buildRecordsFromExtract,
} = require("./tavilyService");
const { getOpenAIClient } = require("./aiClient");

const DEFAULT_MODEL = "gpt-5-mini-2025-08-07";
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_WEB_CHUNK_LIMIT = Number(process.env.TAVILY_AGENT_CHUNK_LIMIT) || 8;
const DEFAULT_AGENT_EXTRACT_TIMEOUT = Number(process.env.TAVILY_AGENT_EXTRACT_TIMEOUT_SECONDS) || undefined;
const DEFAULT_AGENT_EXTRACT_DEPTH = process.env.TAVILY_AGENT_EXTRACT_DEPTH;

function buildSystemPrompt(story, contextSummary) {
  const metadata = story.metadata || {};
  const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
  const sections = [
    "You are HealthLens Newsroom AI, a meticulous assistant for investigative journalists.",
    "Blend structured analysis with empathetic tone. Cite facts from provided context.",
    [
      "TOOLS (use in order):",
      "1. `search_sources` — query the Pinecone namespace for ground-truth quotes and metadata.",
      "2. `search_web` — expand the search with Tavily when local sources are thin or time-sensitive.",
      "3. `extract_web_context` — fetch a specific URL via Tavily and set `upsert: true` when the newsroom needs that source indexed.",
      "Never skip `search_sources` before drafting, and cite the filename or URL for every claim.",
    ].join("\n"),
    "All saved context must stay in this story's Pinecone namespace—never propose or create alternate namespaces.",
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

function buildWebSearchTool() {
  return tool({
    description:
      "Reach beyond the story corpus with Tavily search. Use it when Pinecone lacks up-to-date or corroborating information.",
    parameters: z.object({
      query: z.string().min(3, "Query text is required"),
      searchDepth: z.enum(["advanced", "basic", "fast", "ultra-fast"]).optional(),
      maxResults: z.number().int().min(1).max(20).optional(),
      topic: z.enum(["general", "news", "finance"]).optional(),
      timeRange: z.enum(["day", "week", "month", "year", "d", "w", "m", "y"]).optional(),
    }),
    execute: async ({ query, searchDepth, maxResults, topic, timeRange }) => {
      const response = await searchWeb(query, {
        searchDepth,
        maxResults,
        topic,
        timeRange,
        includeAnswer: false,
        includeRawContent: false,
        includeUsage: true,
      });
      return response;
    },
  });
}

function buildWebExtractTool(storyId) {
  return tool({
    description:
      "Extract the full text of a URL via Tavily and optionally upsert the cleaned chunks into Pinecone for this story.",
    parameters: z.object({
      url: z.string().url("A valid URL is required"),
      intent: z.string().max(240).optional(),
      upsert: z.boolean().optional(),
      label: z.string().max(160).optional(),
      tags: z.array(z.string().min(1).max(60)).max(8).optional(),
      chunkLimit: z.number().int().min(1).max(24).optional(),
    }),
    execute: async ({ url, intent, upsert, label, tags, chunkLimit }) => {
      const extractResponse = await extractWebContent(url, {
        query: intent,
        extractDepth: DEFAULT_AGENT_EXTRACT_DEPTH,
        includeFavicon: true,
        format: "markdown",
        timeout: DEFAULT_AGENT_EXTRACT_TIMEOUT,
        includeUsage: true,
      });

      const responseResults =
        extractResponse?.results ||
        extractResponse?.data?.results ||
        extractResponse?.resultsData ||
        [];

      if (!Array.isArray(responseResults) || responseResults.length === 0) {
        const failedResults =
          extractResponse?.failed_results ||
          extractResponse?.failedResults ||
          extractResponse?.data?.failed_results ||
          extractResponse?.data?.failedResults ||
          [];
        const failure = failedResults.length
          ? failedResults.find((item) => item.url === url) || failedResults[0]
          : null;
        if (failure) {
          throw new Error(`Tavily extract failed for ${url}: ${failure?.error || "Unknown error"}`);
        }
        throw new Error(`Tavily returned no extractable content for ${url}`);
      }

      const records = buildRecordsFromExtract({
        url,
        sourceId: `tavily-agent-${storyId}`,
        sourceType: "web",
        results: responseResults,
        chunkLimit: chunkLimit || DEFAULT_WEB_CHUNK_LIMIT,
        tags,
        metadata: {
          story_id: storyId,
          ...(label ? { source_label: label } : {}),
          ingestion_source: "agent",
        },
      });

      if (!records.length) {
        throw new Error("Extracted content could not be chunked into records");
      }

      let upsertResult = null;
      if (upsert) {
        upsertResult = await upsertSourceText(storyId, records);
      }

      return {
        url,
        recordCount: records.length,
        upserted: Boolean(upsert),
        tavilyUsage: extractResponse?.usage ?? null,
        pinecone: upsertResult,
        records,
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
  const maxSteps = Number(process.env.AGENT_MAX_TOOL_STEPS) || 8;

  const result = await streamText({
    model: openai(modelName),
    temperature: DEFAULT_TEMPERATURE,
    system: buildSystemPrompt(story, contextSummary),
    prompt,
    tools: {
      search_sources: buildSearchTool(storyId),
      search_web: buildWebSearchTool(),
      extract_web_context: buildWebExtractTool(storyId),
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
