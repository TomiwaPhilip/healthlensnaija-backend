const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const controller = require("../controllers/newsroomSourceController");

const uploadsDir = path.join(__dirname, "../../uploads");
fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({ dest: uploadsDir });

const storySourcesRouter = express.Router();
storySourcesRouter.get("/:storyId/sources", controller.listSources);
storySourcesRouter.post(
  "/:storyId/sources",
  upload.single("file"),
  controller.createSource
);

const sourceRouter = express.Router();
sourceRouter.delete("/:sourceId", controller.deleteSource);

module.exports = {
  storySourcesRouter,
  sourceRouter,
};
