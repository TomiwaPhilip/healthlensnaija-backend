const chatService = require("../services/newsroomChatService");

function handleError(res, error) {
  if (/not found/i.test(error.message)) {
    return res.status(404).json({ message: error.message });
  }
  return res.status(400).json({ message: error.message });
}

async function getChatHistory(req, res) {
  try {
    const limit = parseInt(req.query.limit, 10);
    const history = await chatService.getChatHistory(req.params.storyId, limit);
    res.json(history);
  } catch (error) {
    handleError(res, error);
  }
}

async function sendMessage(req, res) {
  try {
    const { message } = req.body;
    const result = await chatService.sendMessage(req.params.storyId, message);
    res.status(201).json(result);
  } catch (error) {
    handleError(res, error);
  }
}

module.exports = {
  getChatHistory,
  sendMessage,
};
