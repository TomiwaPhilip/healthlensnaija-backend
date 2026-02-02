const fs = require("fs/promises");
const { Worker } = require("bullmq");
const pdfParse = require("pdf-parse");
const redisConnection = require("../config/redis");
const { SOURCE_INGEST_QUEUE } = require("../queues/sourceIngestQueue");
const NewsroomSource = require("../models/NewsroomSource");
const { upsertSourceText } = require("../services/newsroomSourceService");
const {
  extractWebContent,
  buildRecordsFromExtract,
  sanitizeText,
} = require("../services/tavilyService");

const TAVILY_URL_CHUNK_LIMIT = Number(process.env.TAVILY_MAX_CHUNKS) || 12;
const TAVILY_EXTRACT_TIMEOUT_SECONDS = Number(process.env.TAVILY_EXTRACT_TIMEOUT_SECONDS) || 30;
const TAVILY_EXTRACT_DEPTH = process.env.TAVILY_EXTRACT_DEPTH || "advanced";

async function cleanupUploadedFile(filePath) {
  if (!filePath) {
    return;
  }

  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("Failed to delete uploaded file", filePath, error.message);
    }
  }
}

async function markSourceStatus(sourceId, patch = {}) {
  if (!sourceId) {
    return null;
  }
  return NewsroomSource.findByIdAndUpdate(sourceId, patch, { new: true });
}

async function buildPdfRecords(filePath, sourceId) {
  if (!filePath) {
    throw new Error("Missing file path for PDF ingestion");
  }

  const buffer = await fs.readFile(filePath);
  const pages = [];
  await pdfParse(buffer, {
    pagerender: async (pageData) => {
      const textContent = await pageData.getTextContent();
      const combined = textContent.items.map((item) => item.str).join(" ");
      const normalized = sanitizeText(combined);
      pages.push(normalized);
      return normalized;
    },
  });

  return pages
    .map((text, index) => ({
      id: `${sourceId}-page-${index + 1}`,
      text,
      metadata: {
        page_number: index + 1,
        source_type: "pdf",
      },
    }))
    .filter((record) => record.text.length > 0);
}

async function buildUrlRecords(url, sourceId) {
  if (!url) {
    throw new Error("Missing URL for scraping");
  }

  const extractResponse = await extractWebContent(url, {
    extractDepth: TAVILY_EXTRACT_DEPTH,
    includeFavicon: true,
    format: "markdown",
    timeout: TAVILY_EXTRACT_TIMEOUT_SECONDS,
  });

  const failedResults =
    extractResponse?.failed_results ||
    extractResponse?.failedResults ||
    extractResponse?.data?.failed_results ||
    extractResponse?.data?.failedResults;
  if (Array.isArray(failedResults) && failedResults.length) {
    const failure = failedResults.find((item) => item.url === url) || failedResults[0];
    throw new Error(
      `Tavily extract failed for ${url}: ${failure?.error || "Unknown error"}`
    );
  }

  const responseResults =
    extractResponse?.results ||
    extractResponse?.data?.results ||
    extractResponse?.resultsData ||
    [];

  const records = buildRecordsFromExtract({
    url,
    sourceId,
    results: responseResults,
    chunkLimit: TAVILY_URL_CHUNK_LIMIT,
    sourceType: "url",
  });

  return records;
}

async function processJob(job) {
  const { type, sourceId, storyId, payload = {} } = job.data || {};

  if (!sourceId || !storyId) {
    throw new Error("sourceId and storyId are required for ingestion");
  }

  await markSourceStatus(sourceId, {
    ingest_status: "processing",
    ingest_error: "",
  });

  let records = [];
  let originalFilePath = null;
  if (type === "pdf") {
    originalFilePath = payload.filePath;
    records = await buildPdfRecords(payload.filePath, sourceId);
  } else if (type === "url") {
    records = await buildUrlRecords(payload.url, sourceId);
  } else {
    throw new Error(`Unsupported source ingestion type: ${type}`);
  }

  if (!records.length) {
    throw new Error("No textual content extracted from source");
  }

  const { recordCount } = await upsertSourceText(storyId, records);

  await markSourceStatus(sourceId, {
    ingest_status: "indexed",
    vector_status: "indexed",
    record_count: recordCount,
    page_count: records.length,
    ingest_error: "",
    last_indexed_at: new Date(),
  });

  if (type === "pdf") {
    await cleanupUploadedFile(originalFilePath);
  }

  return { recordCount, processedRecords: records.length };
}

const worker = new Worker(SOURCE_INGEST_QUEUE, processJob, {
  connection: redisConnection,
});

worker.on("failed", async (job, error) => {
  console.error("Source ingestion failed", job?.id, error);
  if (job?.data?.sourceId) {
    await markSourceStatus(job.data.sourceId, {
      ingest_status: "failed",
      vector_status: "failed",
      ingest_error: error?.message?.slice(0, 400) || "Unknown error",
    });
  }
});

worker.on("completed", (job) => {
  console.log(`✅ Source ingestion completed for job ${job.id}`);
});

module.exports = worker;
