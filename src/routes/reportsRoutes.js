const express = require("express");
const router = express.Router();
const Report = require("../models/Report");

// GET /api/reports
// Returns a list of reports from the database, sorted by date (latest first)
// Optionally, filters reports by startDate and endDate query parameters (format: YYYY-MM-DD)
// Supports pagination with `page` and `limit` query parameters
router.get("/", async (req, res, next) => {
  try {
    const { startDate, endDate, page = 1, limit = 10 } = req.query;
    let query = {};
    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }
    // Fetch reports from the database, sorted with the latest date first
    const reports = await Report.find(query)
      .sort({ date: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    // Get the total count of reports for pagination
    const count = await Report.countDocuments(query);

    res.status(200).json({
      reports,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;