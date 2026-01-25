const express = require("express");
const syncService = require("../services/syncService");

const router = express.Router();

// Bulk Sync Endpoint
router.post("/sync", async (req, res) => {
  try {
    await syncService.bulkSyncToOpenSearch();
    res.status(200).json({ message: "Data synced successfully!" });
  } catch (error) {
    res.status(500).json({ message: "Error syncing data", error: error.message });
  }
});

module.exports = router;
