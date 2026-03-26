const { streamText, tool, jsonSchema, stepCountIs } = require("ai");
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
const DEFAULT_WEB_CHUNK_LIMIT = Number(process.env.TAVILY_AGENT_CHUNK_LIMIT) || 4;
const DEFAULT_AGENT_EXTRACT_TIMEOUT = Number(process.env.TAVILY_AGENT_EXTRACT_TIMEOUT_SECONDS) || 8;
const DEFAULT_AGENT_EXTRACT_DEPTH = process.env.TAVILY_AGENT_EXTRACT_DEPTH;
const TEXT_FIELD = process.env.PINECONE_TEXT_FIELD || "chunk_text";
const AUTO_SOURCE_TOP_K = Number(process.env.AGENT_AUTO_SOURCE_TOP_K) || 4;
const AUTO_WEB_RESULTS = Number(process.env.AGENT_AUTO_WEB_RESULTS) || 2;
const ENABLE_AGENT_WEB_CONTEXT = process.env.AGENT_ENABLE_WEB_CONTEXT !== "false";
const TRUSTED_DOMAINS = getTrustedDomains();
const RESEARCH_MODES = Object.freeze({
  FAST: "fast",
  BALANCED: "balanced",
  DEEP: "deep",
});
const GREETING_REGEX = /^(hi|hello|hey|yo|sup|what'?s up|whats up|good\s+(morning|afternoon|evening)|how are you|how'?s it going)\b/i;
const REPORTING_INTENT_REGEX = /\b(investigat|story|report|source|draft|quote|interview|outline|research|article|upload|document|pdf|url|fact\s*check|health|latest|find|help me)\b/i;
const FRESH_CONTEXT_REGEX = /\b(latest|recent|current|today|tonight|new|breaking|developing|update|updates|this week|this month|right now)\b/i;
const DEEP_RESEARCH_REGEX = /\b(deep\s*dive|comprehensive|exhaustive|thorough|in\s*depth|full\s*research|all\s+angles|every\s+angle)\b/i;
const TOOL_REQUIRED_REGEX = /(https?:\/\/|\b(fetch|extract|ingest|index|upsert|save\s+(this\s+)?url|open\s+(this\s+)?url|crawl)\b)/i;
const HEALTH_NEWS_REGEX = /\b(health|public health|disease|hospital|medical|doctor|clinic|vaccine|outbreak|nutrition|maternal|child health|epidemic)\b/i;

function sanitizeSnippet(value = "", limit = 420) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function summarizeSourceHits(hits = []) {
  if (!Array.isArray(hits) || !hits.length) {
    return "No matching passages found in the available datasets.";
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

function needsFreshContext(prompt = "") {
  return FRESH_CONTEXT_REGEX.test(String(prompt || ""));
}

function needsDeepResearch(prompt = "") {
  return DEEP_RESEARCH_REGEX.test(String(prompt || ""));
}

function requiresSlowToolLoop(prompt = "") {
  return TOOL_REQUIRED_REGEX.test(String(prompt || ""));
}

function normalizeResearchMode(mode) {
  const normalized = String(mode || "").trim().toLowerCase();
  if (normalized === RESEARCH_MODES.FAST || normalized === RESEARCH_MODES.DEEP) {
    return normalized;
  }
  return RESEARCH_MODES.BALANCED;
}

async function gatherAutoContext(
  storyId,
  query,
  { sourcesOnly = false, includeLiveWeb = false, includeDeterm = false } = {}
) {
  const trimmed = (query || "").trim();
  if (!trimmed) {
    return "";
  }

  const sourcePromise = searchSourceText(storyId, trimmed, {
    topK: AUTO_SOURCE_TOP_K,
    fields: [TEXT_FIELD, "source_label", "url", "filename", "source_id"],
  }).catch((error) => {
    console.warn("Auto-context Pinecone search failed", error.message);
    return null;
  });

  const webPromise = !sourcesOnly && ENABLE_AGENT_WEB_CONTEXT && includeLiveWeb
    ? prioritizedWebSearch(trimmed, {
        maxResults: AUTO_WEB_RESULTS,
        topic: "news",
        searchDepth: process.env.TAVILY_DEFAULT_SEARCH_DEPTH || "basic",
        includeRawContent: false,
        includeAnswer: false,
        includeFavicon: false,
        timeout: Number(process.env.TAVILY_SEARCH_TIMEOUT_SECONDS) || 5,
      }).catch((error) => {
        console.warn("Auto-context Tavily search failed", error.message);
        return null;
      })
    : Promise.resolve(null);

  const determPromise = !sourcesOnly && includeDeterm
    ? buildDetermContextSummary(trimmed).catch((error) => {
        console.warn("Auto-context Determ fetch failed", error.message);
        return "";
      })
    : Promise.resolve("");

  const [sourceSearch, webSearch, determSummary] = await Promise.all([
    sourcePromise,
    webPromise,
    determPromise,
  ]);

  const sourceHits = sourceSearch?.result?.hits || [];
  const webResults = webSearch?.results || [];

  const sections = [];
  if (sourceHits.length) {
    sections.push(`Source Evidence:\n${summarizeSourceHits(sourceHits)}`);
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

function isLightweightConversation(prompt = "") {
  const trimmed = String(prompt || "").trim();
  if (!trimmed) {
    return false;
  }

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  return wordCount <= 12 && GREETING_REGEX.test(trimmed) && !REPORTING_INTENT_REGEX.test(trimmed);
}

function buildDirectAnswerSystemPrompt(baseSystemPrompt) {
  return [
    baseSystemPrompt,
    "DIRECT-ANSWER MODE:",
    "- Do not call tools in this turn.",
    "- If the user is greeting you or making brief small talk, reply warmly, naturally, and briefly.",
    "- If the user is asking for reporting help, answer directly from the context already available in this turn.",
    "- Do not start reporting or research answers with greetings, pleasantries, or lines like 'Hey' or 'Great to see you.' Go straight into the substance.",
    "- Do not stall, do not say you are about to research unless you actually need more information from the user.",
  ].join("\n\n");
}

async function streamAssistantText({ openai, modelName, system, prompt, tools, stopWhen, onToken, onStatus, toolLabels }) {
  const result = await streamText({
    model: openai(modelName),
    system,
    prompt,
    ...(tools ? { tools } : {}),
    ...(stopWhen ? { stopWhen } : {}),
  });

  let text = "";
  const chunkTypes = [];

  for await (const chunk of result.fullStream) {
    chunkTypes.push(chunk.type);

    if (chunk.type === "error") {
      console.error("streamText error chunk:", chunk.error);
      throw chunk.error instanceof Error
        ? chunk.error
        : new Error(String(chunk.error || "Unknown streaming error"));
    }

    if (chunk.type === "tool-call" && typeof onStatus === "function") {
      const label = toolLabels?.[chunk.toolName] || `Using ${chunk.toolName}…`;
      await onStatus(label);
      continue;
    }

    if (chunk.type === "tool-result" && typeof onStatus === "function") {
      await onStatus("Processing results…");
      continue;
    }

    const deltaText =
      chunk.type === "text-delta"
        ? (typeof chunk.text === "string" ? chunk.text : chunk.textDelta)
        : null;

    if (deltaText) {
      text += deltaText;
      if (typeof onToken === "function") {
        await onToken(deltaText);
      }
    }
  }

  if (!text) {
    try {
      text = await result.text;
    } catch (fallbackErr) {
      console.error("result.text fallback failed:", fallbackErr.message);
    }
  }

  return {
    text: text.trim(),
    finishReason: result.finishReason,
    chunkTypes,
  };
}

function buildSystemPrompt(
  story,
  contextSummary,
  chatHistorySummary,
  autoContextSummary,
  { sourcesOnly = false, researchMode = RESEARCH_MODES.BALANCED } = {}
) {
  const metadata = story.metadata || {};
  const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
  const modeInstructions =
    researchMode === RESEARCH_MODES.FAST
      ? [
          "RESEARCH MODE: FAST",
          "- Optimize for speed and quick time-to-first-answer.",
          "- Prefer the existing story knowledge base and current context over broad exploration.",
          "- Keep the answer focused and useful without trying to be exhaustive.",
        ].join("\n")
      : researchMode === RESEARCH_MODES.DEEP
        ? [
            "RESEARCH MODE: DEEP",
            "- Be thorough and widen the evidence base when needed.",
            "- It is acceptable to spend more effort searching for corroboration and broader context.",
            "- Prefer richer coverage, stronger grounding, and more complete synthesis over raw speed.",
          ].join("\n")
        : [
            "RESEARCH MODE: BALANCED",
            "- Balance speed with useful depth.",
            "- Gather enough evidence to be confident, then synthesize without over-researching.",
          ].join("\n");
  const sections = [
    "You are HealthLens Newsroom AI, a meticulous yet warm and friendly assistant for investigative journalists.",
    "Blend structured analysis with an approachable, conversational tone. Cite facts from provided context.",
    "Be personable without sounding canned. Only greet the user if their current message is itself a greeting or brief small talk. For research, drafting, or analysis requests, skip pleasantries and begin directly with the answer.",
    modeInstructions,
    [
      "TOOLS (use in order):",
      "1. `search_sources` — query the story's knowledge base for ground-truth quotes and metadata.",
      "2. `search_web` — expand the search when local sources are thin or time-sensitive. Always ping the newsroom's verified domains first (see validWebsites.json) before widening the query.",
      "3. `extract_web_context` — fetch a specific URL and set `upsert: true` when the newsroom needs that source indexed.",
      "Speed rule: prefer a good-enough answer fast over exhaustive searching.",
      "After one strong `search_sources` result set, draft immediately unless the user explicitly asked for a deep dive or latest breaking developments.",
      "Use `search_web` at most once in most turns. Only use it again if the first web pass was clearly insufficient.",
      "Do not chain multiple tool rounds just to broaden coverage. Synthesize early.",
      "For simple greetings or brief small talk, do NOT use tools; reply directly and warmly.",
      "Do NOT start normal reporting answers with generic openers like 'Hey', 'Great to see you', or 'Nice to hear from you' unless the user just greeted you.",
      "Never skip `search_sources` before drafting, and cite the filename or URL for every claim.",
    ].join("\n"),
    "All saved context must stay in this story's knowledge base—never propose or create alternate storage.",
    "If a user goes completely off-topic (e.g., asking you to write unrelated code, play games, or do tasks totally outside journalism), gently and warmly bring the conversation back: acknowledge their message, then remind them you're here to help with their investigation.",
    [
      "FORMAT RULES:",
      "- Write every response as polished Markdown.",
      "- Use **bold** for key terms, findings, and emphasis.",
      "- Use bullet/numbered lists whenever listing facts, recommendations, or steps.",
      "- Use headings (##, ###) to organize sections clearly.",
      "- Every URL you cite MUST start with https:// — never output a bare domain like articles.nigeriahealthwatch.com; always write https://articles.nigeriahealthwatch.com.",
      "- When you generate a story, article, report, or draft: end your response with the finished content. Do NOT add follow-up questions, suggestions, or 'What would you like to do next?' prompts after the generated text.",
    ].join("\n"),
    "Never fabricate information. Every assertion must reference retrieved passages (include filename or URL and page when available). If the available datasets lack answers, explain what is missing and request follow-up ingestion.",
    "IMPORTANT: Never mention internal tools, databases, indexes, or technical infrastructure (such as Pinecone, Tavily, vector stores, namespaces, etc.) in your responses to users. Instead, refer to 'the available datasets', 'the story's knowledge base', 'ingested sources', or 'curated research materials'.",
    sourcesOnly
      ? [
          "SOURCES-ONLY MODE (ACTIVE):",
          "The user has enabled sources-only mode. You MUST strictly follow these rules:",
          "- ONLY use evidence, facts, and quotes from the uploaded documents and ingested sources in this story's knowledge base.",
          "- Do NOT supplement with your own training knowledge, general information, or any outside context.",
          "- Do NOT use the `search_web` or `extract_web_context` tools.",
          "- If the uploaded sources do not contain enough information to answer the query, say so clearly. List what is missing and suggest the user upload additional documents.",
          "- Every claim must cite the source filename or URL from the ingested materials.",
        ].join("\n")
      : null,
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
      "Search the story's knowledge base and available datasets to retrieve ground-truth passages, quotes, and metadata. Use this before composing any narrative.",
    inputSchema: jsonSchema({
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
      "Reach beyond the ingested sources with a live web search. Use it when the available datasets lack up-to-date or corroborating information. The agent automatically prioritizes the newsroom's verified Nigerian health/governance domains before general web search.",
    inputSchema: jsonSchema({
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
      "Extract the full text of a URL and optionally save the cleaned content into this story's knowledge base.",
    inputSchema: jsonSchema({
      type: "object",
      properties: {
        url: { type: "string", format: "uri", description: "URL to extract" },
        intent: { type: "string", maxLength: 240, description: "Optional context for extraction" },
        upsert: { type: "boolean", description: "Whether to save into the story knowledge base" },
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
  onStatus,
  sourcesOnly = false,
  researchMode = RESEARCH_MODES.BALANCED,
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
  const normalizedResearchMode = normalizeResearchMode(researchMode);
  const maxSteps = normalizedResearchMode === RESEARCH_MODES.DEEP
    ? Number(process.env.AGENT_MAX_TOOL_STEPS_DEEP) || 5
    : normalizedResearchMode === RESEARCH_MODES.FAST
      ? Number(process.env.AGENT_MAX_TOOL_STEPS_FAST) || 1
      : Number(process.env.AGENT_MAX_TOOL_STEPS) || 2;
  const lightweightConversation = isLightweightConversation(prompt);
  const freshContextNeeded = needsFreshContext(prompt);
  const deepResearchRequested = needsDeepResearch(prompt);
  const toolLoopRequired = !sourcesOnly && (
    normalizedResearchMode === RESEARCH_MODES.DEEP ||
    requiresSlowToolLoop(prompt)
  );
  const includeLiveWeb = !lightweightConversation && !sourcesOnly && (
    normalizedResearchMode === RESEARCH_MODES.DEEP ||
    (normalizedResearchMode !== RESEARCH_MODES.FAST && (freshContextNeeded || deepResearchRequested))
  );
  const includeDeterm =
    normalizedResearchMode === RESEARCH_MODES.DEEP &&
    includeLiveWeb &&
    HEALTH_NEWS_REGEX.test(String(prompt || ""));

  if (typeof onStatus === "function") {
    await onStatus("Analyzing your query…");
  }

  const autoContextSummary = lightweightConversation
    ? ""
    : await gatherAutoContext(storyId, prompt, {
        sourcesOnly,
        includeLiveWeb,
        includeDeterm,
      });

  const systemPrompt = buildSystemPrompt(
    story,
    contextSummary,
    chatHistorySummary,
    autoContextSummary,
    { sourcesOnly, researchMode: normalizedResearchMode }
  );
  const directAnswerPrompt = buildDirectAnswerSystemPrompt(systemPrompt);

  const TOOL_LABELS = {
    search_sources: "Searching uploaded sources…",
    search_web: "Searching the web for context…",
    extract_web_context: "Extracting content from a URL…",
  };

  if (lightweightConversation) {
    if (typeof onStatus === "function") {
      await onStatus("Thinking…");
    }

    const directResponse = await streamAssistantText({
      openai,
      modelName,
      system: directAnswerPrompt,
      prompt,
      onToken,
    });

    return {
      text: directResponse.text,
      finishReason: directResponse.finishReason,
    };
  }

  if (!toolLoopRequired) {
    if (typeof onStatus === "function") {
      await onStatus(
        normalizedResearchMode === RESEARCH_MODES.FAST
          ? "Drafting quick answer…"
          : includeLiveWeb
            ? "Drafting from gathered evidence…"
            : "Drafting response…"
      );
    }

    const fastResponse = await streamAssistantText({
      openai,
      modelName,
      system: directAnswerPrompt,
      prompt,
      onToken,
    });

    return {
      text: fastResponse.text,
      finishReason: fastResponse.finishReason,
    };
  }

  const tools = { search_sources: buildSearchTool(storyId) };
  if (!sourcesOnly) {
    tools.search_web = buildWebSearchTool();
    tools.extract_web_context = buildWebExtractTool(storyId);
  }

  if (typeof onStatus === "function") {
    await onStatus("Thinking…");
  }

  const toolResponse = await streamAssistantText({
    openai,
    modelName,
    system: systemPrompt,
    prompt,
    tools,
    stopWhen: stepCountIs(maxSteps),
    onToken,
    onStatus,
    toolLabels: TOOL_LABELS,
  });

  if (!toolResponse.text) {
    console.warn("Tool-enabled run finished without text; retrying in direct-answer mode", {
      storyId,
      prompt: String(prompt || "").slice(0, 120),
      chunkTypes: toolResponse.chunkTypes,
      finishReason: toolResponse.finishReason,
    });

    if (typeof onStatus === "function") {
      await onStatus("Finalizing response…");
    }

    const recoveryResponse = await streamAssistantText({
      openai,
      modelName,
      system: directAnswerPrompt,
      prompt,
      onToken,
    });

    return {
      text: recoveryResponse.text,
      finishReason: recoveryResponse.finishReason,
    };
  }

  return {
    text: toolResponse.text,
    finishReason: toolResponse.finishReason,
  };
}

module.exports = {
  generateAssistantReply,
  RESEARCH_MODES,
};
