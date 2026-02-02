const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const NewsroomSource = require("../models/NewsroomSource");
const { getStoryById } = require("./newsroomStoryService");
const {
  getNamespaceIndex,
  buildStoryNamespace,
} = require("./pineconeClient");

const uploadsDir = path.join(__dirname, "../../uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const MAX_TEXT_RECORDS_PER_BATCH = 96; // Pinecone integrated embedding batch limit
const TEXT_FIELD = process.env.PINECONE_TEXT_FIELD || "text";

async function ensureStory(storyId) {
  const story = await getStoryById(storyId);
  if (!story) {
    throw new Error("Story not found");
  }
  return story;
}

async function listSources(storyId) {
  await ensureStory(storyId);
  return NewsroomSource.find({ story: storyId }).sort({ createdAt: -1 }).lean();
}

function normalizeRecordId(storyId, record, index) {
  const candidate = record?.id || record?._id || record?.recordId;
  if (candidate && String(candidate).trim()) {
    return String(candidate).trim();
  }
  return `story-${storyId}-${Date.now()}-${index}`;
}

function extractRecordText(record) {
  const textCandidate = record?.[TEXT_FIELD] || record?.text || record?.content;
  if (!textCandidate || !String(textCandidate).trim()) {
    throw new Error("Each record must include non-empty text content");
  }
  return String(textCandidate).trim();
}

function prepareRecords(storyId, records = []) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("At least one record is required for Pinecone upsert");
  }

  return records.map((record, index) => {
    const chunkText = extractRecordText(record);
    const metadata =
      record && typeof record.metadata === "object" && record.metadata !== null
        ? record.metadata
        : {};

    const payload = {
      id: normalizeRecordId(storyId, record, index),
      [TEXT_FIELD]: chunkText,
      ...metadata,
    };

    if (record.sourceId || record.source_id) {
      payload.source_id = record.sourceId || record.source_id;
    }
    if (record.sourceLabel) {
      payload.source_label = record.sourceLabel;
    }
    if (Array.isArray(record.tags) && record.tags.length) {
      payload.tags = record.tags;
    }

    return payload;
  });
}

async function upsertSourceText(storyId, records = []) {
  await ensureStory(storyId);
  const namespace = buildStoryNamespace(storyId);
  const namespaceClient = getNamespaceIndex(namespace);
  const preparedRecords = prepareRecords(storyId, records);

  for (let i = 0; i < preparedRecords.length; i += MAX_TEXT_RECORDS_PER_BATCH) {
    const batch = preparedRecords.slice(i, i + MAX_TEXT_RECORDS_PER_BATCH);
    await namespaceClient.upsertRecords({ records: batch });
  }

  return {
    namespace,
    recordCount: preparedRecords.length,
  };
}

async function searchSourceText(storyId, query, options = {}) {
  await ensureStory(storyId);

  if (!query || !String(query).trim()) {
    throw new Error("Query text is required for semantic search");
  }

  const namespace = buildStoryNamespace(storyId);
  const namespaceClient = getNamespaceIndex(namespace);
  const topK = Number.isFinite(options.topK) && options.topK > 0 ? Math.min(options.topK, 25) : 5;
  const fields =
    Array.isArray(options.fields) && options.fields.length > 0
      ? options.fields
      : [TEXT_FIELD, "source_id", "source_label", "tags"];

  const response = await namespaceClient.searchRecords({
    query: {
      inputs: { text: String(query).trim() },
      topK,
    },
    fields,
  });

  return {
    namespace,
    topK,
    result: response?.result ?? null,
    usage: response?.usage ?? null,
  };
}

async function createSource(storyId, file) {
  await ensureStory(storyId);

  if (!file) {
    throw new Error("No file uploaded");
  }

  const source = await NewsroomSource.create({
    story: storyId,
    filename: file.originalname,
    file_type: file.mimetype,
    file_url: file.path,
  });

  return source.toObject();
}

async function deleteSource(sourceId) {
  if (!mongoose.Types.ObjectId.isValid(sourceId)) {
    return null;
  }

  const source = await NewsroomSource.findByIdAndDelete(sourceId);
  if (!source) {
    return null;
  }

  return source.toObject();
}

module.exports = {
  listSources,
  createSource,
  deleteSource,
  upsertSourceText,
  searchSourceText,
};
