const express = require("express");
const controller = require("../controllers/newsroomChatController");

const router = express.Router();

router.get("/:storyId/chat", controller.getChatHistory);
router.post("/:storyId/chat", controller.sendMessage);

module.exports = router;
