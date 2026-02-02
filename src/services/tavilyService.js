const { tavily } = require("@tavily/core");

const DEFAULT_SEARCH_DEPTH = process.env.TAVILY_DEFAULT_SEARCH_DEPTH || "basic";
const DEFAULT_EXTRACT_DEPTH = process.env.TAVILY_DEFAULT_EXTRACT_DEPTH || "advanced";
const DEFAULT_CHUNK_SIZE = Number(process.env.TAVILY_CHUNK_SIZE) || 1600;
const DEFAULT_CHUNK_OVERLAP = Number(process.env.TAVILY_CHUNK_OVERLAP) || 200;
const DEFAULT_CHUNK_LIMIT = Number(process.env.TAVILY_MAX_CHUNKS) || 12;
let cachedClient;

function getApiKey() {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY is required to call Tavily APIs");
  }
  return apiKey;
}

function cleanPayload(payload = {}) {
  return Object.entries(payload).reduce((acc, [key, value]) => {
    if (value === undefined || value === null) {
      return acc;
    }

    if (Array.isArray(value)) {
      const filtered = value.filter((entry) => entry !== undefined && entry !== null);
      if (!filtered.length) {
        return acc;
      }
      acc[key] = filtered;
      return acc;
    }

    acc[key] = value;
    return acc;
  }, {});
}

function getTavilyClient() {
  if (cachedClient) {
    return cachedClient;
  }

  const apiKey = getApiKey();
  const clientOptions = { apiKey };

  if (process.env.TAVILY_BASE_URL) {
    clientOptions.baseUrl = process.env.TAVILY_BASE_URL;
  }

  if (process.env.TAVILY_PROJECT) {
    clientOptions.projectId = process.env.TAVILY_PROJECT;
  }

  const proxies = cleanPayload({
    http: process.env.TAVILY_HTTP_PROXY,
    https: process.env.TAVILY_HTTPS_PROXY,
  });

  if (Object.keys(proxies).length) {
    clientOptions.proxies = proxies;
  }

  cachedClient = tavily(clientOptions);
  return cachedClient;
}

async function searchWeb(query, options = {}) {
  if (!query || !String(query).trim()) {
    throw new Error("A search query is required");
  }

  const client = getTavilyClient();
  const payload = cleanPayload({
    query: String(query).trim(),
    searchDepth: options.searchDepth || DEFAULT_SEARCH_DEPTH,
    maxResults: options.maxResults,
    topic: options.topic,
    timeRange: options.timeRange,
    startDate: options.startDate,
    endDate: options.endDate,
    includeAnswer: options.includeAnswer,
    includeRawContent: options.includeRawContent,
    includeImages: options.includeImages,
    includeImageDescriptions: options.includeImageDescriptions,
    includeFavicon: options.includeFavicon,
    includeDomains: options.includeDomains,
    excludeDomains: options.excludeDomains,
    autoParameters: options.autoParameters,
    includeUsage: options.includeUsage ?? true,
    chunksPerSource: options.chunksPerSource,
    country: options.country,
    timeout: options.timeout,
  });

  return client.search(payload);
}

async function extractWebContent(urls, options = {}) {
  const urlList = Array.isArray(urls) ? urls : [urls];
  const sanitized = urlList.map((url) => String(url || "").trim()).filter(Boolean);

  if (!sanitized.length) {
    throw new Error("At least one URL is required for Tavily extract");
  }

  const client = getTavilyClient();
  const payload = cleanPayload({
    urls: sanitized,
    query: options.query,
    extractDepth: options.extractDepth || DEFAULT_EXTRACT_DEPTH,
    includeImages: options.includeImages,
    includeFavicon: options.includeFavicon,
    format: options.format || "markdown",
    timeout: options.timeout,
    includeUsage: options.includeUsage ?? true,
    chunksPerSource: options.chunksPerSource,
  });

  return client.extract(payload);
}

function sanitizeText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function chunkText(text, { chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_CHUNK_OVERLAP } = {}) {
  const normalized = sanitizeText(text);
  if (!normalized) {
    return [];
  }

  const effectiveChunk = Math.max(400, chunkSize);
  const effectiveOverlap = Math.min(Math.floor(effectiveChunk / 2), Math.max(0, overlap));

  if (normalized.length <= effectiveChunk) {
    return [normalized];
  }

  const chunks = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + effectiveChunk, normalized.length);
    let slice = normalized.slice(start, end);

    if (end < normalized.length) {
      const lastSentenceBoundary = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("? "), slice.lastIndexOf("! "));
      if (lastSentenceBoundary > effectiveChunk * 0.4) {
        slice = slice.slice(0, lastSentenceBoundary + 1);
        end = start + lastSentenceBoundary + 1;
      }
    }

    chunks.push(slice.trim());

    if (end >= normalized.length) {
      break;
    }

    start = Math.max(0, end - effectiveOverlap);
  }

  return chunks.filter(Boolean);
}

function buildRecordsFromExtract({
  url,
  sourceId,
  sourceType = "web",
  results = [],
  chunkLimit = DEFAULT_CHUNK_LIMIT,
  chunkSize = DEFAULT_CHUNK_SIZE,
  chunkOverlap = DEFAULT_CHUNK_OVERLAP,
  tags = [],
  metadata = {},
} = {}) {
  const normalizedResults = Array.isArray(results) ? results : [];
  const sanitizedTags = Array.isArray(tags)
    ? tags.map((tag) => String(tag || "").trim()).filter(Boolean)
    : [];

  const finalRecords = [];
  let chunkCounter = 0;
  const idPrefix = sourceId || `tavily-${Math.random().toString(36).slice(2, 8)}`;

  for (let resultIndex = 0; resultIndex < normalizedResults.length; resultIndex += 1) {
    if (chunkCounter >= chunkLimit) {
      break;
    }

    const result = normalizedResults[resultIndex] || {};
    const canonicalUrl = result.url || url;
    const labelFromResult = result.title || result.site_name || canonicalUrl || url;
    const baseLabel = metadata.source_label || labelFromResult;

    const textBuckets = [];

    if (Array.isArray(result.chunks) && result.chunks.length) {
      for (const chunk of result.chunks) {
        const chunkValue =
          chunk?.content ||
          chunk?.text ||
          chunk?.raw_content ||
          (typeof chunk === "string" ? chunk : null);
        if (chunkValue) {
          textBuckets.push(chunkValue);
        }
      }
    }

    if (!textBuckets.length && result.raw_content) {
      textBuckets.push(result.raw_content);
    }

    if (!textBuckets.length && result.content) {
      textBuckets.push(result.content);
    }

    for (const bucket of textBuckets) {
      if (chunkCounter >= chunkLimit) {
        break;
      }

      const splitChunks = chunkText(bucket, { chunkSize, overlap: chunkOverlap });
      for (const chunkValue of splitChunks) {
        if (!chunkValue) {
          continue;
        }

        chunkCounter += 1;
        const metadataPayload = {
          source_type: sourceType,
          url: canonicalUrl,
          source_label: baseLabel,
          chunk_index: chunkCounter,
          ingestion_provider: "tavily",
          ...(result.title ? { title: result.title } : {}),
          ...(result.favicon ? { favicon: result.favicon } : {}),
          ...(result.published_date ? { published_date: result.published_date } : {}),
          ...(result.language ? { language: result.language } : {}),
          ...metadata,
        };

        if (sanitizedTags.length && !metadataPayload.tags) {
          metadataPayload.tags = sanitizedTags;
        }

        finalRecords.push({
          id: `${idPrefix}-${resultIndex + 1}-chunk-${chunkCounter}`,
          text: chunkValue,
          metadata: metadataPayload,
        });

        if (chunkCounter >= chunkLimit) {
          break;
        }
      }
    }
  }

  return finalRecords;
}

module.exports = {
  searchWeb,
  extractWebContent,
  buildRecordsFromExtract,
  sanitizeText,
  chunkText,
};
