const fs = require("fs/promises");
const { Worker } = require("bullmq");
const pdfParse = require("pdf-parse");
const { chromium } = require("playwright");
const redisConnection = require("../config/redis");
const { SOURCE_INGEST_QUEUE } = require("../queues/sourceIngestQueue");
const NewsroomSource = require("../models/NewsroomSource");
const { upsertSourceText } = require("../services/newsroomSourceService");

const SCRAPER_FORMAT = process.env.LLM_SCRAPER_FORMAT || "text";

let preprocessPromise;
function loadPreprocess() {
  if (!preprocessPromise) {
    preprocessPromise = import("llm-scraper/dist/preprocess.js").then((mod) => mod.preprocess);
  }
  return preprocessPromise;
}

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

function sanitizeText(value = "") {
  return value.replace(/\s+/g, " ").trim();
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

  const preprocess = await loadPreprocess();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: Number(process.env.SCRAPER_NAV_TIMEOUT_MS) || 45000,
    });

    const processed = await preprocess(page, { format: SCRAPER_FORMAT });
    const text = sanitizeText(processed.content || "");

    if (!text) {
      return [];
    }

    return [
      {
        id: `${sourceId}-url`,
        text,
        metadata: {
          source_type: "url",
          url,
        },
      },
    ];
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
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
