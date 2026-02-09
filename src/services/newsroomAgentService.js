const { streamText, tool, jsonSchema } = require("ai");
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
const { buildDetermContextSummary } = require("../utils/determ");
const { getTrustedDomains } = require("../utils/trustedWebsites");

const DEFAULT_MODEL = "gpt-5-mini-2025-08-07";
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_WEB_CHUNK_LIMIT = Number(process.env.TAVILY_AGENT_CHUNK_LIMIT) || 8;
const DEFAULT_AGENT_EXTRACT_TIMEOUT = Number(process.env.TAVILY_AGENT_EXTRACT_TIMEOUT_SECONDS) || undefined;
const DEFAULT_AGENT_EXTRACT_DEPTH = process.env.TAVILY_AGENT_EXTRACT_DEPTH;
const TEXT_FIELD = process.env.PINECONE_TEXT_FIELD || "chunk_text";
const AUTO_SOURCE_TOP_K = Number(process.env.AGENT_AUTO_SOURCE_TOP_K) || 6;
const AUTO_WEB_RESULTS = Number(process.env.AGENT_AUTO_WEB_RESULTS) || 3;
const ENABLE_AGENT_WEB_CONTEXT = process.env.AGENT_ENABLE_WEB_CONTEXT !== "false";
const TRUSTED_DOMAINS = getTrustedDomains();

function sanitizeSnippet(value = "", limit = 420) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function summarizeSourceHits(hits = []) {
  if (!Array.isArray(hits) || !hits.length) {
    return "No Pinecone passages retrieved.";
  }

  return hits.slice(0, AUTO_SOURCE_TOP_K).map((hit, index) => {
    const values = hit?.values || hit?.record || hit || {};
    const label =
      values.source_label ||
      values.filename ||
      values.url ||
      values.source_id ||
      hit?.id ||
      `Source ${index + 1}`;
    const snippet =
      sanitizeSnippet(values[TEXT_FIELD]) ||
      sanitizeSnippet(values.text) ||
      sanitizeSnippet(values.content);
    return `${index + 1}. ${label}\nSnippet: ${snippet || "[empty chunk]"}`;
  }).join("\n\n");
}

function summarizeWebResults(results = []) {
  if (!Array.isArray(results) || !results.length) {
    return "No live web snippets retrieved.";
  }

  return results.slice(0, AUTO_WEB_RESULTS).map((result, index) => {
    const title = result.title || result.url || `Web Result ${index + 1}`;
    const snippet = sanitizeSnippet(result.content || result.raw_content || result.rawContent || "");
    return `${index + 1}. ${title}\n${result.url || ""}\nSnippet: ${snippet || "[empty snippet]"}`;
  }).join("\n\n");
}

async function prioritizedWebSearch(query, options = {}) {
  const hasCustomDomains = Array.isArray(options.includeDomains) && options.includeDomains.length;
  if (!TRUSTED_DOMAINS.length || hasCustomDomains) {
    return searchWeb(query, options);
  }

  try {
    const trustedResponse = await searchWeb(query, {
      ...options,
      includeDomains: TRUSTED_DOMAINS,
    });

    if (trustedResponse?.results?.length) {
      return trustedResponse;
    }
  } catch (error) {
    console.warn("Trusted-domain Tavily search failed", error.message);
  }

  return searchWeb(query, options);
}

async function gatherAutoContext(storyId, query) {
  const trimmed = (query || "").trim();
  if (!trimmed) {
    return "";
  }

  let sourceHits = [];
  try {
    const sourceSearch = await searchSourceText(storyId, trimmed, {
      topK: AUTO_SOURCE_TOP_K,
      fields: [TEXT_FIELD, "source_label", "url", "filename", "source_id"],
    });
    sourceHits = sourceSearch?.result?.hits || [];
  } catch (error) {
    console.warn("Auto-context Pinecone search failed", error.message);
  }

  let webResults = [];
  if (ENABLE_AGENT_WEB_CONTEXT) {
    try {
      const webSearch = await prioritizedWebSearch(trimmed, {
        maxResults: AUTO_WEB_RESULTS,
        topic: "news",
        includeRawContent: "markdown",
        includeAnswer: false,
        includeFavicon: true,
      });
      webResults = webSearch?.results || [];
    } catch (error) {
      console.warn("Auto-context Tavily search failed", error.message);
    }
  }

  let determSummary = "";
  try {
    determSummary = await buildDetermContextSummary(trimmed);
  } catch (error) {
    console.warn("Auto-context Determ fetch failed", error.message);
  }

  const sections = [];
  if (sourceHits.length) {
    sections.push(`Pinecone Evidence:\n${summarizeSourceHits(sourceHits)}`);
  }
  if (webResults.length) {
    sections.push(`Web Findings:\n${summarizeWebResults(webResults)}`);
  }
  if (determSummary) {
    sections.push(`Determ Articles:\n${determSummary}`);
  }

  if (!sections.length) {
    return "";
  }

  return sections.join("\n\n");
}

function buildSystemPrompt(story, contextSummary, chatHistorySummary, autoContextSummary) {
  const metadata = story.metadata || {};
  const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
  const sections = [
    "You are HealthLens Newsroom AI, a meticulous assistant for investigative journalists.",
    "Blend structured analysis with empathetic tone. Cite facts from provided context.",
    [
      "TOOLS (use in order):",
      "1. `search_sources` — query the Pinecone namespace for ground-truth quotes and metadata.",
      "2. `search_web` — expand the search with Tavily when local sources are thin or time-sensitive. Always ping the newsroom's verified domains first (see validWebsites.json) before widening the query.",
      "3. `extract_web_context` — fetch a specific URL via Tavily and set `upsert: true` when the newsroom needs that source indexed.",
      "Never skip `search_sources` before drafting, and cite the filename or URL for every claim.",
    ].join("\n"),
    "All saved context must stay in this story's Pinecone namespace—never propose or create alternate namespaces.",
    "Scope Guard: Decline casual chat or requests unrelated to this investigation; politely redirect to newsroom tasks only.",
    "Write every response as polished Markdown with informative headings, tight paragraphs, and inline source citations (filename or URL).",
    "Never fabricate information. Every assertion must reference retrieved passages (include filename or URL and page when available). If the library lacks answers, explain what is missing and request follow-up ingestion.",
    `Story Title: ${story.title}`,
    `Status: ${story.status}`,
    tags.length ? `Tags: ${tags.join(", ")}` : null,
    metadata.region ? `Region: ${metadata.region}` : null,
    metadata.brief ? `Story Brief: ${metadata.brief}` : null,
    "Context Bundle:\n" + (contextSummary || "No extra context provided."),
    chatHistorySummary ? "Conversation Recap (recent turns):\n" + chatHistorySummary : null,
    autoContextSummary ? "Retrieved Evidence (auto-search):\n" + autoContextSummary : null,
    "When data is missing, describe the gap and propose next investigative steps.",
  ].filter(Boolean);

  return sections.join("\n\n");
}

function buildSearchTool(storyId) {
  return tool({
    description:
      "Search the Pinecone knowledge base for this story to retrieve ground-truth passages, quotes, and metadata. Use this before composing any narrative.",
    parameters: jsonSchema({
      type: "object",
      properties: {
        query: { type: "string", minLength: 3, description: "Query text" },
        topK: { type: "integer", minimum: 1, maximum: 20, description: "Number of results" },
        fields: { type: "array", items: { type: "string" }, maxItems: 6, description: "Fields to return" },
      },
      required: ["query"],
      additionalProperties: false,
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
      "Reach beyond the story corpus with Tavily search. Use it when Pinecone lacks up-to-date or corroborating information. The agent automatically prioritizes the newsroom's verified Nigerian health/governance domains before general web search.",
    parameters: jsonSchema({
      type: "object",
      properties: {
        query: { type: "string", minLength: 3, description: "Query text" },
        searchDepth: { type: "string", enum: ["advanced", "basic", "fast", "ultra-fast"] },
        maxResults: { type: "integer", minimum: 1, maximum: 20 },
        topic: { type: "string", enum: ["general", "news", "finance"] },
        timeRange: { type: "string", enum: ["day", "week", "month", "year", "d", "w", "m", "y"] },
      },
      required: ["query"],
      additionalProperties: false,
    }),
    execute: async ({ query, searchDepth, maxResults, topic, timeRange }) => {
      const baseOptions = {
        searchDepth,
        maxResults,
        topic,
        timeRange,
        includeAnswer: false,
        includeRawContent: false,
        includeUsage: true,
      };
      const response = await prioritizedWebSearch(query, baseOptions);
      return response;
    },
  });
}

function buildWebExtractTool(storyId) {
  return tool({
    description:
      "Extract the full text of a URL via Tavily and optionally upsert the cleaned chunks into Pinecone for this story.",
    parameters: jsonSchema({
      type: "object",
      properties: {
        url: { type: "string", format: "uri", description: "URL to extract" },
        intent: { type: "string", maxLength: 240, description: "Optional context for extraction" },
        upsert: { type: "boolean", description: "Whether to upsert into Pinecone" },
        label: { type: "string", maxLength: 160, description: "Label for the source" },
        tags: { type: "array", items: { type: "string", minLength: 1, maxLength: 60 }, maxItems: 8 },
        chunkLimit: { type: "integer", minimum: 1, maximum: 24 },
      },
      required: ["url"],
      additionalProperties: false,
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

async function generateAssistantReply({
  story,
  prompt,
  contextSummary,
  chatHistorySummary,
  onToken,
}) {
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
  const autoContextSummary = await gatherAutoContext(storyId, prompt);

  const result = await streamText({
    model: openai(modelName),
    temperature: DEFAULT_TEMPERATURE,
    system: buildSystemPrompt(story, contextSummary, chatHistorySummary, autoContextSummary),
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
    if (!delta) {
      continue;
    }
    text += delta;
    if (typeof onToken === "function") {
      await onToken(delta);
    }
  }

  return {
    text: text.trim(),
    finishReason: result.finishReason,
  };
}

module.exports = {
  generateAssistantReply,
};
