const path = require("path");
const fs = require("fs");
const { store, generateId } = require("../utils/newsroomStore");
const { getStoryById } = require("./newsroomStoryService");

const uploadsDir = path.join(__dirname, "../../uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

function listSources(storyId) {
  if (!getStoryById(storyId)) {
    throw new Error("Story not found");
  }

  return store.sources.filter((source) => source.story_id === storyId);
}

function createSource(storyId, file) {
  if (!getStoryById(storyId)) {
    throw new Error("Story not found");
  }

  if (!file) {
    throw new Error("No file uploaded");
  }

  const now = new Date().toISOString();
  const source = {
    id: generateId("source"),
    story_id: storyId,
    filename: file.originalname,
    file_type: file.mimetype,
    file_url: `/uploads/${path.basename(file.path)}`,
    vector_status: "pending",
    uploaded_at: now,
  };

  store.sources.push(source);
  return source;
}

function deleteSource(sourceId) {
  const index = store.sources.findIndex((source) => source.id === sourceId);
  if (index === -1) {
    return null;
  }

  const [removed] = store.sources.splice(index, 1);
  return removed;
}

module.exports = {
  listSources,
  createSource,
  deleteSource,
};
