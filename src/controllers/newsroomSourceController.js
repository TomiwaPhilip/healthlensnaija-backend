const sourceService = require("../services/newsroomSourceService");

function handleError(res, error) {
  if (/not found/i.test(error.message)) {
    return res.status(404).json({ message: error.message });
  }
  return res.status(400).json({ message: error.message });
}

function parseRecordsPayload(rawRecords) {
  if (!rawRecords) {
    return [];
  }

  if (Array.isArray(rawRecords)) {
    return rawRecords;
  }

  if (typeof rawRecords === "string") {
    try {
      const parsed = JSON.parse(rawRecords);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      throw new Error("records payload must be valid JSON");
    }
  }

  return [];
}

async function listSources(req, res) {
  try {
    const sources = await sourceService.listSources(req.params.storyId);
    res.json(sources);
  } catch (error) {
    handleError(res, error);
  }
}

async function createSource(req, res) {
  try {
    const created = await sourceService.createSource(req.params.storyId, req.file);
    res.status(201).json(created);
  } catch (error) {
    handleError(res, error);
  }
}

async function createUrlSource(req, res) {
  try {
    const created = await sourceService.createUrlSource(req.params.storyId, req.body.url);
    res.status(201).json(created);
  } catch (error) {
    handleError(res, error);
  }
}

async function deleteSource(req, res) {
  try {
    const removed = await sourceService.deleteSource(req.params.sourceId);
    if (!removed) {
      return res.status(404).json({ message: "Source not found" });
    }
    res.json({ success: true });
  } catch (error) {
    handleError(res, error);
  }
}

async function upsertSourceText(req, res) {
  try {
    const records = parseRecordsPayload(req.body.records);
    const result = await sourceService.upsertSourceText(req.params.storyId, records);
    res.status(202).json(result);
  } catch (error) {
    handleError(res, error);
  }
}

async function searchSourceText(req, res) {
  try {
    const { query, topK, fields } = req.body;
    const result = await sourceService.searchSourceText(req.params.storyId, query, {
      topK,
      fields,
    });
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
}

module.exports = {
  listSources,
  createSource,
  createUrlSource,
  deleteSource,
  upsertSourceText,
  searchSourceText,
};
