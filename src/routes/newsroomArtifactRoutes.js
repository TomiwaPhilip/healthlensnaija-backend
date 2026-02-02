const express = require("express");
const controller = require("../controllers/newsroomArtifactController");

const storyArtifactsRouter = express.Router();
storyArtifactsRouter.get("/:storyId/artifacts", controller.listArtifacts);
storyArtifactsRouter.post("/:storyId/artifacts", controller.createArtifact);

const artifactRouter = express.Router();
artifactRouter.put("/:artifactId", controller.updateArtifact);
artifactRouter.delete("/:artifactId", controller.deleteArtifact);
artifactRouter.post("/:artifactId/export", controller.exportArtifact);

module.exports = {
  storyArtifactsRouter,
  artifactRouter,
};
