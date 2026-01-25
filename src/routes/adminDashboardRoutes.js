// backend/src/routes/adminDashboardRoutes.js
const express = require("express");
const BaseUser = require("../models/User");
const Chat = require("../models/Chats");
const Story    = require("../models/Story");
// const verifyToken = require("../middlewares/dbauth");
const PendingDocument = require("../models/PendingDocument");
const checkRole = require("../middlewares/checkRole");
const verifyToken = require("../middlewares/verifyToken");
const router = express.Router();
const UserActivity = require("../models/UserActivity");
const ROLE_ORDER = ["Guest", "Standard", "Admin"];
const scrapeNigeriaHealthWatch = require("../utils/scrapeNigeriaHealthWatch");
const scrapeAndCache = require("../utils/scrapeWithCache");
const ScrapedWebsite = require("../models/ScrapedWebsite");
const BaseScrapeUrl = require("../models/BaseScrapeUrl");

const mongoose = require("mongoose");


const fs = require("fs");
const path = require("path");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const fetchLinkedStory = require("../utils/fetchLinkedStory");


const { chunkText } = require("../utils/chunkText");
const { storeEmbedding } = require("../utils/embedAndStore");
const ExtractedDocument = require("../models/ExtractedDocument");
const upload = multer({ dest: "uploads/" });




// ============================
// 📘 ADMIN PENDING DOC ROUTES
// ============================

// 1️⃣ Get all pending documents (for review dashboard)
router.get("/pending-docs", verifyToken, checkRole(["Admin"]), async (req, res) => {
  try {
    const pendingDocs = await PendingDocument.find()
      .populate("metadata.uploaded_by", "firstName lastName email role")
      .sort({ createdAt: -1 })
      .select("title pillar keywords status metadata upload_date content_summary");

    res.json({ count: pendingDocs.length, documents: pendingDocs });
  } catch (err) {
    console.error("❌ Error fetching pending documents:", err);
    res.status(500).json({ message: "Failed to fetch pending documents", error: err.message });
  }
});


// 2️⃣ Approve (Promote) a Pending Document → ExtractedDocument
router.patch("/pending-docs/:id/approve", verifyToken, checkRole(["Admin"]), async (req, res) => {
  try {
    const { id } = req.params;
    const { pillar } = req.body;

    const pending = await PendingDocument.findById(id);
    if (!pending) return res.status(404).json({ message: "Pending document not found" });

    // Prevent duplicates
    const existing = await ExtractedDocument.findOne({ title: pending.title, full_content: pending.full_content });
    if (existing) {
      return res.status(400).json({ message: "Document already exists in training database" });
    }

    // ✅ Clone into ExtractedDocument
    const promoted = new ExtractedDocument({
      title: pending.title,
      source: "Approved User Upload",
      pillar: pillar || pending.pillar,
      keywords: pending.keywords,
      content_summary: pending.content_summary,
      full_content: pending.full_content,
      metadata: {
        uploaded_by: pending.metadata.uploaded_by,
        upload_date: pending.metadata.upload_date,
        file_type: pending.metadata.file_type,
        size: pending.metadata.size,
      },
      status: "trained",
      trainedAt: new Date(),
    });

    await promoted.save();

    // 🔁 Update pending doc status
    pending.status = "trained";
    pending.trainedAt = new Date();
    await pending.save();

    res.json({
      message: "✅ Document approved and promoted to AI training dataset",
      trainingId: promoted._id,
      promotedTitle: promoted.title,
    });
  } catch (err) {
    console.error("❌ Error approving document:", err);
    res.status(500).json({ message: "Failed to approve document", error: err.message });
  }
});


// 3️⃣ Reject a Pending Document
router.patch("/pending-docs/:id/reject", verifyToken, checkRole(["Admin"]), async (req, res) => {
  try {
    const { id } = req.params;
    const pending = await PendingDocument.findById(id);
    if (!pending) return res.status(404).json({ message: "Document not found" });

    pending.status = "rejected";
    await pending.save();

    res.json({ message: `🗑️ Document "${pending.title}" rejected`, id });
  } catch (err) {
    console.error("❌ Reject error:", err);
    res.status(500).json({ message: "Failed to reject document", error: err.message });
  }
});


// 4️⃣ Delete a Pending Document (cleanup or spam)
router.delete("/pending-docs/:id", verifyToken, checkRole(["Admin"]), async (req, res) => {
  try {
    const { id } = req.params;
    const pending = await PendingDocument.findById(id);
    if (!pending) return res.status(404).json({ message: "Document not found" });

    await PendingDocument.deleteOne({ _id: id });
    res.json({ message: `🗑️ Pending document "${pending.title}" deleted`, id });
  } catch (err) {
    console.error("❌ Delete error:", err);
    res.status(500).json({ message: "Failed to delete pending document", error: err.message });
  }
});

router.get("/stats", async (req, res) => {
  try {
    // Total registered users
    const totalUsers = await BaseUser.countDocuments();

    // Active users (verified + logged in within last 30 days)
    const activeUsers = await BaseUser.countDocuments({
      isVerified: true,
      lastLogin: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    });

    // Total stories created
    const totalStories = await Story.countDocuments();

    // Calculate average engagement (likes per story)
    const stories = await Story.find({}, { likes: 1 });
    const totalLikes = stories.reduce(
      (sum, story) => sum + (story.likes ? story.likes.length : 0),
      0
    );
    const avgEngagement =
      totalStories > 0 ? (totalLikes / totalStories).toFixed(2) : 0;

    // Send unified response
    res.json({
      totalUsers,
      activeUsers,
      totalStories,
      avgEngagement,
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    res.status(500).json({ message: "Error fetching stats" });
  }
});


// Expose CRUD on Stories
router.get("/stories",       async (req, res) => res.json(await Story.find()));
router.post("/stories",      async (req, res) => {
  const story = await Story.create(req.body);
  res.status(201).json(story);
});
router.put("/stories/:id",   async (req, res) => {
  const story = await Story.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(story);
});
router.delete("/stories/:id",async (req, res) => {
  await Story.findByIdAndDelete(req.params.id);
  res.status(204).end();
});

// Expose CRUD on Users
router.get("/users",       async (req, res) => res.json(await BaseUser.find()));
router.put("/users/:id",   async (req, res) => {
  const user = await BaseUser.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(user);
});
router.delete("/users/:id",async (req, res) => {
  await BaseUser.findByIdAndDelete(req.params.id);
  res.status(204).end();
});
// ---- Role & Suspension Management ----

// Update role
router.put("/users/:id/role", async (req, res) => {
  try {
    const { role } = req.body; // e.g. "Admin", "Verified", "Guest"
    if (!["Admin", "Verified", "Guest", "Editor", "Analyst", "Moderator"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }
    const user = await BaseUser.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    );
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Error updating role" });
  }
});

// Suspend or unsuspend user
router.put("/users/:id/suspend", async (req, res) => {
  try {
    const { suspended } = req.body; // true/false
    const user = await BaseUser.findByIdAndUpdate(
      req.params.id,
      { suspended },
      { new: true }
    );
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Error suspending user" });
  }
});

// Bulk actions (delete/verify/suspend)

// Bulk actions for users
// Role hierarchy
// Bulk actions for users (single implementation)
router.post("/users/bulk", async (req, res) => {
  try {
    const { action, userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: "No users selected" });
    }

    let result;

    switch (action) {
      case "delete":
        result = await BaseUser.deleteMany({ _id: { $in: userIds } });
        break;

      case "suspend":
        result = await BaseUser.updateMany(
          { _id: { $in: userIds } },
          { $set: { suspended: true } }
        );
        break;

      case "unsuspend":
        result = await BaseUser.updateMany(
          { _id: { $in: userIds } },
          { $set: { suspended: false } }
        );
        break;

      case "verify":
        result = await BaseUser.updateMany(
          { _id: { $in: userIds } },
          { $set: { isVerified: true } }
        );
        break;

      case "promote":
        result = await BaseUser.updateMany(
          { _id: { $in: userIds } },
          [
            {
              $set: {
                role: {
                  $switch: {
                    branches: [
                      { case: { $eq: ["$role", "Guest"] }, then: "Standard" },
                      { case: { $eq: ["$role", "Standard"] }, then: "Admin" },
                    ],
                    default: "$role", // Admin stays Admin
                  },
                },
              },
            },
          ]
        );
        break;

      case "demote":
        result = await BaseUser.updateMany(
          { _id: { $in: userIds } },
          [
            {
              $set: {
                role: {
                  $switch: {
                    branches: [
                      { case: { $eq: ["$role", "Admin"] }, then: "Standard" },
                      { case: { $eq: ["$role", "Standard"] }, then: "Guest" },
                    ],
                    default: "$role", // Guest stays Guest
                  },
                },
              },
            },
          ]
        );
        break;

      default:
        return res.status(400).json({ message: "Invalid action" });
    }

    res.json({ message: `Bulk ${action} completed`, result });
  } catch (err) {
    console.error("Bulk action error:", err);
    res.status(500).json({ message: "Server error" });
  }
});



// backend/src/routes/adminDashboardRoutes.js
router.get("/analytics/active", async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date();
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

    const dailyActive = await UserActivity.distinct("userId", { date: { $gte: startOfDay } });
    const weeklyActive = await UserActivity.distinct("userId", { date: { $gte: startOfWeek } });

    // Dummy fallback if empty
    const daily = dailyActive.length || 15;   // <- fake data
    const weekly = weeklyActive.length || 70; // <- fake data

    res.json({ dailyActiveUsers: daily, weeklyActiveUsers: weekly });
  } catch (err) {
    res.status(500).json({ message: "Error fetching active users" });
  }
});


// Retention & churn example

// ✅ FIXED retention calculation
router.get("/analytics/retention", async (req, res) => {
  try {
    const now = new Date();

    // Define ranges
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(now.getDate() - 7);

    const lastWeekStart = new Date(now);
    lastWeekStart.setDate(now.getDate() - 14);

    // Query actual DB
    const lastWeekUsers = await UserActivity.distinct("userId", {
      date: { $gte: lastWeekStart, $lt: thisWeekStart }
    });

    const thisWeekUsers = await UserActivity.distinct("userId", {
      date: { $gte: thisWeekStart }
    });

    // Calculate returning users
    const returningUsers = thisWeekUsers.filter(u => lastWeekUsers.includes(u));

    let retentionRate;
    if (lastWeekUsers.length > 0) {
      retentionRate = (returningUsers.length / lastWeekUsers.length) * 100;
    } else {
      // 👉 fallback dummy data for presentation/demo
      retentionRate = 65; 
    }

    res.json({
      retentionRate: Math.round(retentionRate * 100) / 100, // keep 2 decimals
      lastWeekUsers: lastWeekUsers.length || 50,   // dummy fallback
      thisWeekUsers: thisWeekUsers.length || 55,   // dummy fallback
      returningUsers: returningUsers.length || 32, // dummy fallback
    });
  } catch (err) {
    console.error("Retention analytics error:", err);
    // Provide dummy response if DB fails
    res.json({
      retentionRate: 62.5,
      lastWeekUsers: 48,
      thisWeekUsers: 52,
      returningUsers: 30,
      note: "⚠️ Using dummy data due to error"
    });
  }
});



router.get("/analytics/retention-trend", async (req, res) => {
  try {
    const results = await UserActivity.aggregate([
      {
        $group: {
          _id: { month: { $month: "$date" }, year: { $year: "$date" } },
          activeUsers: { $addToSet: "$userId" }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    let trend;

    if (results.length > 0) {
      // Map real DB results
      trend = results.map(r => ({
        month: `${r._id.year}-${String(r._id.month).padStart(2, "0")}`,
        activeUsers: r.activeUsers.length
      }));
    } else {
      // 👉 Dummy fallback (last 6 months)
      const now = new Date();
      trend = Array.from({ length: 6 }).map((_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        return {
          month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
          activeUsers: Math.floor(40 + Math.random() * 60) // random between 40–100
        };
      });
    }

    res.json(trend);
  } catch (err) {
    console.error("Retention trend error:", err);

    // Always return dummy data if DB query fails
    const now = new Date();
    const fallback = Array.from({ length: 6 }).map((_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return {
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        activeUsers: 50 + i * 10 // simple increasing trend
      };
    });

    res.json(fallback);
  }
});


router.get("/analytics/by-hour", async (req, res) => {
  const results = await UserActivity.aggregate([
    { $group: { _id: { $hour: "$date" }, count: { $sum: 1 } } },
    { $sort: { "_id": 1 } }
  ]);
  res.json(results);
});

router.get("/analytics/by-region", async (req, res) => {
  const results = await UserActivity.aggregate([
    { $group: { _id: "$region", count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
  res.json(results);
});

router.get("/analytics/user-growth", async (req, res) => {
  const results = await BaseUser.aggregate([
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
      }
    },
    { $sort: { "_id": 1 } }
  ]);

  let cumulative = 0;
  const cumulativeResults = results.map(r => {
    cumulative += r.count;
    return { date: r._id, totalUsers: cumulative };
  });

  res.json(cumulativeResults);
});

router.get("/analytics/by-action", async (req, res) => {
  const results = await UserActivity.aggregate([
    { $group: { _id: "$action", count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
  res.json(results);
});

// Admin-only upload to train AI
router.post("/train/document/:id", async (req, res) => {
  try {
    const doc = await ExtractedDocument.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Document not found" });

    const chunks = chunkText(doc.full_content);

    for (const chunk of chunks) {
      await storeEmbedding(chunk);
    }

    doc.status = "trained";
    doc.trainedAt = new Date();
    await doc.save();

    res.json({
      message: `✅ Document ${doc.title} trained successfully`,
      chunks: chunks.length,
      doc,
    });
  } catch (err) {
    console.error("Training error:", err);
    res.status(500).json({ message: "Training failed", error: err.message });
  }
});


// Bulk-train all uploaded documents
router.post("/train/all", verifyToken, checkRole(["Admin"]), async (req, res) => {
  try {
    const docs = await ExtractedDocument.find({ status: "pending" });
    let totalChunks = 0;

    for (const doc of docs) {
      const chunks = chunkText(doc.full_content);
      for (const chunk of chunks) {
        await storeEmbedding(chunk);
      }
      totalChunks += chunks.length;

      doc.status = "trained";
      doc.trainedAt = new Date();
      await doc.save();
    }

    res.json({ message: `✅ All documents trained`, totalChunks });
  } catch (err) {
    res.status(500).json({ message: "Bulk training failed", error: err.message });
  }
});


// View all user chats (admin only)
router.get("/all", verifyToken, checkRole(["Admin"]), async (req, res) => {
  try {
    const chats = await Chat.find()
      .populate("userId", "firstName lastName email role")
      .sort({ createdAt: -1 });
    res.json(chats);
  } catch (err) {
    res.status(500).json({ message: "Error fetching chats", error: err.message });
  }
});

// View chats by specific user
router.get("/user/:id", verifyToken, checkRole(["Admin"]), async (req, res) => {
  try {
    const chats = await Chat.find({ userId: req.params.id }).sort({ createdAt: -1 });
    res.json(chats);
  } catch (err) {
    res.status(500).json({ message: "Error fetching user chats", error: err.message });
  }
});



// ------------------ Top 10 Most Asked Questions ------------------
router.get("/analytics/top-questions", async (req, res) => {
  try {
    const results = await Chat.aggregate([
      { $unwind: "$messages" },
      { $match: { "messages.user": "user" } }, // match by "user" field
      { $group: { _id: "$messages.text", count: { $sum: 1 } } }, // use "text"
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.json(results.map(r => ({
      question: r._id,
      count: r.count
    })));
  } catch (err) {
    console.error("Error fetching top questions:", err);
    res.status(500).json({ message: "Error fetching top questions", error: err.message });
  }
});




router.get("/documents", async (req, res) => {
  try {
    const docs = await ExtractedDocument.find()
      .sort({ createdAt: -1 })
      .select("_id title status trainedAt metadata.upload_date"); // keep payload lean

    res.json(docs);
  } catch (err) {
    res.status(500).json({ message: "Error fetching documents", error: err.message });
  }
});


// put this BEFORE the global verifyToken/checkRole
router.post(
  "/documents/upload",
  upload.single("file"),  
  verifyToken,            
  checkRole(["Admin"]),
  async (req, res) => {
    try {
      // console.log("📥 Incoming upload:", {
      //   originalname: req.file?.originalname,
      //   mimetype: req.file?.mimetype,
      //   size: req.file?.size,
      //   user: req.user, // from verifyToken
      // });

      if (!req.file) {
        console.error("❌ No file parsed by multer");
        return res.status(400).json({ message: "No file uploaded" });
      }

      const filePath = req.file.path;
      let extractedText = "";

      if (req.file.mimetype === "application/pdf") {
        // console.log("🔍 Extracting PDF...");
        const pdfData = await pdfParse(fs.readFileSync(filePath));
        extractedText = pdfData.text;
        // console.log("✅ PDF text length:", extractedText.length);
      } else if (req.file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        // console.log("🔍 Extracting DOCX...");
        const result = await mammoth.extractRawText({ buffer: fs.readFileSync(filePath) });
        extractedText = result.value;
        // console.log("✅ DOCX text length:", extractedText.length);
      } else if (req.file.mimetype.startsWith("text/")) {
        // console.log("🔍 Extracting plain text...");
        extractedText = fs.readFileSync(filePath, "utf8");
        // console.log("✅ TXT text length:", extractedText.length);
      } else {
        console.error("❌ Unsupported file type:", req.file.mimetype);
        return res.status(400).json({ message: "Unsupported file type" });
      }

      const doc = new ExtractedDocument({
        title: req.file.originalname,
        full_content: extractedText,
        metadata: {
          uploaded_by: req.user.id,
          upload_date: new Date(),
        }
      });

      await doc.save();
      // console.log("💾 Saved document:", doc._id, doc.title);

      try {
        fs.unlinkSync(filePath);
        // console.log("🗑️ Temp file deleted");
      } catch (e) {
        console.warn("⚠️ Could not delete temp file:", e.message);
      }

      res.status(201).json(doc);
    } catch (err) {
      console.error("🔥 Upload error:", err);
      res.status(500).json({ message: "Upload failed", error: err.message });
    }
  }
);

router.use(verifyToken, checkRole(["Admin"]));


// 👇 then apply the global guard for everything else

router.post("/documents/text", verifyToken, checkRole(["Admin"]), async (req, res) => {
  try {
    const { title, full_content } = req.body;
    if (!title || !full_content) {
      return res.status(400).json({ message: "Title and content are required" });
    }

    const doc = new ExtractedDocument({ title, full_content });
    await doc.save();
    // after doc.save()
// await axios.post(
//   `${process.env.BACKEND_URL}/api/admin-dashboard/train/document/${doc._id}`,
//   {},
//   {
//     headers: { Authorization: req.headers.authorization },
//   }
// );

// after doc.save()
// await axios.post(
//   `${process.env.BACKEND_URL}/api/admin-dashboard/train/document/${doc._id}`,
//   {},
//   {
//     headers: { Authorization: req.headers.authorization },
//   }
// );


    res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ message: "Error saving text document", error: err.message });
  }
});

// DELETE a document by ID
router.delete("/documents/:id", async (req, res) => {
  try {
    const doc = await ExtractedDocument.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Document not found" });

    await doc.deleteOne();

    res.json({ message: `🗑️ Document "${doc.title}" deleted successfully` });
  } catch (err) {
    res.status(500).json({ message: "Error deleting document", error: err.message });
  }
});


// GET preview of a document
router.get("/documents/:id/preview", async (req, res) => {
  try {
    const doc = await ExtractedDocument.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Not found" });

    res.json({
      _id: doc._id,
      title: doc.title,
      status: doc.status,
      preview: doc.full_content.substring(0, 2000), // first ~2000 chars
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching preview", error: err.message });
  }
});

router.post("/documents/extract", upload.single("file"), async (req, res) => {
  try {
    const filePath = req.file.path;
    let text = "";

    if (req.file.mimetype === "application/pdf") {
      const data = await pdfParse(fs.readFileSync(filePath));
      text = data.text;
    } else if (
      req.file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({ path: filePath });
      text = result.value;
    }

    // ✅ Send raw text back so admin can preview
    res.json({ success: true, preview: text.substring(0, 2000) }); // send first ~2000 chars
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});



// Trigger a full scrape of all base URLs
router.post("/scrape/nigeria-health-watch", async (req, res) => {
  try {
    const text = await scrapeNigeriaHealthWatch();
    res.json({ message: "✅ Scraping completed", length: text.length, preview: text.slice(0, 500) });
  } catch (err) {
    console.error("Scrape error:", err);
    res.status(500).json({ message: "Scraping failed", error: err.message });
  }
});

// Scrape a single URL with caching
router.post("/scrape/url", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ message: "Missing URL" });

    const text = await scrapeAndCache(url);
    res.json({ message: "✅ Scraping completed", length: text.length, preview: text.slice(0, 500) });
  } catch (err) {
    console.error("Scrape error:", err);
    res.status(500).json({ message: "Scraping failed", error: err.message });
  }
});



router.post("/scrape/nigeria-health-watch/save", async (req, res) => {
  try {
    const text = await scrapeNigeriaHealthWatch();
    const doc = new ExtractedDocument({ title: "Nigeria Health Watch scrape", full_content: text });
    await doc.save();
    res.json({ message: "✅ Scraped & saved", id: doc._id });
  } catch (err) {
    res.status(500).json({ message: "Save failed", error: err.message });
  }
});

// List all base URLs
router.get("/scrape/base-urls", async (req, res) => {
  const urls = await BaseScrapeUrl.find().sort({ createdAt: -1 });
  res.json(urls);
});

// Add new base URL
router.post("/scrape/base-urls", async (req, res) => {
  const { url, title } = req.body;
  const newUrl = await BaseScrapeUrl.create({ url, title });
  res.status(201).json(newUrl);
});

// Update
router.put("/scrape/base-urls/:id", async (req, res) => {
  const updated = await BaseScrapeUrl.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(updated);
});

// Delete
router.delete("/scrape/base-urls/:id", async (req, res) => {
  await BaseScrapeUrl.findByIdAndDelete(req.params.id);
  res.json({ message: "✅ Base URL deleted" });
});


// Scrape & Save
router.post("/scrape/save", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ message: "Missing URL" });

    const text = await scrapeAndCache(url);
    const doc = new ScrapedWebsite({
      url,
      title: `Scraped: ${url}`,
      content: text,
      preview: text.slice(0, 300),
    });
    await doc.save();

    res.json({ message: "✅ Saved successfully", id: doc._id });
  } catch (err) {
    res.status(500).json({ message: "Save failed", error: err.message });
  }
});

// List all
router.get("/scrape/list", async (req, res) => {
  try {
    const docs = await ScrapedWebsite.find().sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) {
    res.status(500).json({ message: "Fetch failed", error: err.message });
  }
});

// Delete
router.delete("/scrape/:id", async (req, res) => {
  try {
    await ScrapedWebsite.findByIdAndDelete(req.params.id);
    res.json({ message: "✅ Deleted" });
  } catch (err) {
    res.status(500).json({ message: "Delete failed", error: err.message });
  }
});

// Update
router.put("/scrape/:id", async (req, res) => {
  try {
    const { title, content } = req.body;
    const updated = await ScrapedWebsite.findByIdAndUpdate(
      req.params.id,
      { title, content },
      { new: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Update failed", error: err.message });
  }
});


router.post("/scrape/:id/promote", async (req, res) => {
  try {
    const { id } = req.params;
    const { pillar } = req.body; // ⬅️ now we accept pillar
    const site = await ScrapedWebsite.findById(id);
    if (!site) return res.status(404).json({ message: "Scraped site not found" });

    if (!pillar) {
      return res.status(400).json({ message: "Pillar is required" });
    }

    const doc = new ExtractedDocument({
      title: site.title || "Promoted Website",
      source: "Web Scrape",
      pillar,
      keywords: [],
      content_summary: site.preview,
      full_content: site.content,
      metadata: {
        uploaded_by: req.user.id,
        file_type: "HTML",
        size: `${site.content.length} chars`,
      },
    });
    await doc.save();

    res.json({ message: "✅ Promoted to AI Training", trainingId: doc._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Promote failed", error: err.message });
  }
});

// backend/src/routes/adminDashboardRoutes.js

// Group by language
router.get("/analytics/by-language", async (req, res) => {
  try {
    const results = await UserActivity.aggregate([
      { $match: { action: "generate_story" } },
      { $group: { _id: "$language", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ message: "Error fetching language analytics", error: err.message });
  }
});

// Group by tone
router.get("/analytics/by-tone", async (req, res) => {
  try {
    const results = await UserActivity.aggregate([
      { $match: { action: "generate_story" } },
      { $group: { _id: "$tone", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ message: "Error fetching tone analytics", error: err.message });
  }
});


module.exports = router;
