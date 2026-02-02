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

function wantsStream(req) {
  const accept = req.headers.accept || "";
  return req.query.stream === "1" || accept.includes("text/event-stream");
}

function writeSse(res, event, payload) {
  if (res.writableEnded) {
    return;
  }
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function streamAgentResponse(req, res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  let closed = false;
  req.on("close", () => {
    closed = true;
  });

  const sendToken = (token) => {
    if (closed || !token) {
      return;
    }
    writeSse(res, "token", { token });
  };

  try {
    const { message } = req.body;
    const result = await chatService.sendMessage(req.params.storyId, message, {
      onToken: sendToken,
    });
    if (!closed) {
      writeSse(res, "complete", result);
      res.end();
    }
  } catch (error) {
    console.error("streamAgentResponse error", error);
    if (!closed) {
      writeSse(res, "error", { message: error.message });
      res.end();
    }
  }
}

async function sendMessage(req, res) {
  if (wantsStream(req)) {
    return streamAgentResponse(req, res);
  }

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
