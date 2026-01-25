const express = require("express");
const router = express.Router();
const Notification = require("../models/Notification");

// GET /api/notifications
// Fetch notifications with optional filtering, searching, and pagination
router.get("/", async (req, res, next) => {
  try {
    const { filter, search, page = 1, limit = 10 } = req.query;

    // Build the query object
    let query = {};

    // Filter by read/unread status
    if (filter === "read") {
      query.isRead = true;
    } else if (filter === "unread") {
      query.isRead = false;
    }

    // Search by title or message
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { message: { $regex: search, $options: "i" } },
      ];
    }

    // Fetch notifications with pagination
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 }) // Sort by most recent first
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    // Get the total count of notifications for pagination
    const count = await Notification.countDocuments(query);

    res.status(200).json({
      notifications,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/notifications/:id
// Mark a notification as read/unread
router.patch("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isRead } = req.body;

    const notification = await Notification.findByIdAndUpdate(
      id,
      { isRead },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.status(200).json(notification);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/notifications/:id
// Delete a specific notification
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findByIdAndDelete(id);

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.status(200).json({ message: "Notification deleted successfully" });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/notifications
// Clear all notifications
router.delete("/", async (req, res, next) => {
  try {
    await Notification.deleteMany({});
    res.status(200).json({ message: "All notifications cleared successfully" });
  } catch (error) {
    next(error);
  }
});

module.exports = router;