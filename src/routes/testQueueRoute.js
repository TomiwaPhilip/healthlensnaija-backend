const express = require("express");
const { storyQueue } = require("../queues/storyQueue");
const router = express.Router();

router.get("/test-queue", async (req, res) => {
  try {
    const job = await storyQueue.add("testJob", {
      message: "Hello from testQueue",
      user: "system",
    });

    console.log("📤 Test job added:", job.id);
    res.json({ message: "Job added to queue", jobId: job.id });
  } catch (err) {
    console.error("❌ Failed to add job:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
