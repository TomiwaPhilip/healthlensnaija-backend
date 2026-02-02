const express = require("express");
const controller = require("../controllers/newsroomStoryController");

const router = express.Router();

router.get("/", controller.listStories);
router.post("/", controller.createStory);
router.get("/:storyId", controller.getStory);
router.delete("/:storyId", controller.deleteStory);

module.exports = router;
