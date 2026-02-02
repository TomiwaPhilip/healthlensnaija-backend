const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const NewsroomSource = require("../models/NewsroomSource");
const { getStoryById } = require("./newsroomStoryService");

const uploadsDir = path.join(__dirname, "../../uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

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
};
