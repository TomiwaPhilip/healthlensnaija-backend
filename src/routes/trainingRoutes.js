const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const mammoth = require("mammoth");
const { embedText } = require("../utils/embedAndStore");
const TrainingDocument = require("../models/TrainingDocument");
const { detectPillarAndKeywords } = require("../utils/pillarMatcher");
const verifyToken = require("../middlewares/verifyToken");
const checkRole = require("../middlewares/checkRole");
const { spawn } = require("child_process");
const path = require("path");

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// 📝 Simple summary generator
function generateSummary(text) {
  if (!text) return "Summary not available.";
  const sentences = text.split(". ");
  const filtered = sentences.filter((s) => s.length > 10);
  return filtered.slice(0, 3).join(". ") + ".";
}

// ✅ PDF text extractor
// async function extractTextFromPdf(filePath) {
//   const data = new Uint8Array(await fs.promises.readFile(filePath));
//   const loadingTask = pdfjsLib.getDocument({ data });
//   const pdfDocument = await loadingTask.promise;

//   let text = "";
//   for (let i = 1; i <= pdfDocument.numPages; i++) {
//     const page = await pdfDocument.getPage(i);
//     const content = await page.getTextContent();
//     const strings = content.items.map((item) => item.str);
//     text += strings.join(" ") + "\n";
//   }
//   return text;
// }
// 📥 Upload file — extract text + tables
router.post(
  "/upload",
  verifyToken,
  checkRole(["Admin"]),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      let extractedText = "";
      let extractedTables = [];

      const filePath = req.file.path;

      if (req.file.mimetype === "application/pdf") {
        // Call Python script to extract
        const pythonScript = path.join(__dirname, "../python/extract_pdf.py");
        const proc = spawn("python3", [pythonScript, filePath]);

        let stdout = "";
        let stderr = "";

        proc.stdout.on("data", (data) => {
          stdout += data.toString();
        });

        proc.stderr.on("data", (data) => {
          stderr += data.toString();
        });

        const exitCode = await new Promise((resolve, reject) => {
          proc.on("close", resolve);
          proc.on("error", reject);
        });

        if (exitCode !== 0) {
          console.error("Python extraction error:", stderr);
          // Fallback: maybe simple text extract via pdf-parser or pdfjs etc
          extractedText = "[Extraction via Python script failed]";
          extractedTables = [];
        } else {
          let result;
          try {
            result = JSON.parse(stdout);
          } catch (err) {
            console.error("Failed to parse Python output:", err, stdout);
            result = {};
          }
          extractedText = result.text || "";
          if (result.tables_camelot && result.tables_camelot.length > 0) {
            extractedTables = result.tables_camelot;
          } else if (result.tables_pymupdf && result.tables_pymupdf.length > 0) {
            extractedTables = result.tables_pymupdf;
          } else {
            extractedTables = [];
          }
        }
      }
      else if (
        req.file.mimetype ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        const buffer = await fs.promises.readFile(filePath);
        const result = await mammoth.extractRawText({ buffer });
        extractedText = result.value || "";

        // *You might also want to run a Python script for docx table extraction, or use a Node library*
        extractedTables = []; // or your existing officeParser logic
      }
      else if (req.file.mimetype.startsWith("text/")) {
        extractedText = await fs.promises.readFile(filePath, "utf8");
        extractedTables = [];
      }
      else {
        // unsupported file type
        extractedText = "";
        extractedTables = [];
      }

      if (!extractedText || extractedText.trim().length === 0) {
        extractedText = "[No extractable text — file may contain only tables/images]";
      }

      const { pillar, keywords } = detectPillarAndKeywords(extractedText);

      const doc = new TrainingDocument({
        title: req.file.originalname,
        full_content: extractedText,
        content_summary: generateSummary(extractedText),
        pillar: pillar || null,
        keywords: keywords || [],
        tables: extractedTables,
        status: "pending",
        metadata: {
          uploaded_by: req.user?.id || "system",
          size: `${Math.round(req.file.size / 1024)} KB`,
          file_type: req.file.mimetype,
        },
      });

      await doc.save();
      
      // cleanup
      fs.unlink(filePath, (err) => {
        if (err) console.error("Failed to delete temp file:", err);
      });

      return res.status(201).json(doc);
    } catch (err) {
      console.error("❌ Upload error:", err);
      return res.status(500).json({ message: "Upload failed", error: err.message });
    }
  }
);


// 📝 Update metadata (pillar, keywords)
router.put("/:id/metadata", async (req, res) => {
  try {
    const { pillar, keywords } = req.body;
    const doc = await TrainingDocument.findByIdAndUpdate(
      req.params.id,
      { pillar, keywords },
      { new: true }
    );
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: "Failed to update metadata", error: err.message });
  }
});

// 🚂 Train one doc
router.post("/:id/train", async (req, res) => {
  try {
    const doc = await TrainingDocument.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Not found" });
    if (!doc.full_content || doc.full_content.trim().length === 0) {
      return res.status(400).json({ message: "No content to embed" });
    }

    const embedding = await embedText(doc.full_content);
    doc.embedding = embedding;
    doc.status = "trained";
    doc.trainedAt = new Date();
    await doc.save();

    res.json({ message: "Trained successfully", doc });
  } catch (err) {
    res.status(500).json({ message: "Training failed", error: err.message });
  }
});

// 🚂 Train all pending docs
router.post("/train-all", async (req, res) => {
  try {
    const docs = await TrainingDocument.find({ status: "pending" });
    let trainedCount = 0;

    for (const doc of docs) {
      if (!doc.full_content || doc.full_content.trim().length === 0) continue;
      const embedding = await embedText(doc.full_content);
      doc.embedding = embedding;
      doc.status = "trained";
      doc.trainedAt = new Date();
      await doc.save();
      trainedCount++;
    }

    res.json({ message: `✅ Trained ${trainedCount} documents` });
  } catch (err) {
    res.status(500).json({ message: "Bulk training failed", error: err.message });
  }
});

// 📑 List all
router.get("/", async (req, res) => {
  const docs = await TrainingDocument.find().sort({ createdAt: -1 });
  res.json(docs);
});

// 📑 Get one (preview modal)
router.get("/:id", async (req, res) => {
  try {
    const doc = await TrainingDocument.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Not found" });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch doc", error: err.message });
  }
});

// 🗑 Delete one
router.delete("/:id", async (req, res) => {
  try {
    const doc = await TrainingDocument.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: "Document not found" });
    res.json({ message: `🗑️ Document "${doc.title}" deleted successfully` });
  } catch (err) {
    res.status(500).json({ message: "Delete failed", error: err.message });
  }
});

// 🗑 Delete all
router.delete("/", async (req, res) => {
  try {
    const result = await TrainingDocument.deleteMany({});
    res.json({ message: `🗑️ Deleted ${result.deletedCount} documents` });
  } catch (err) {
    res.status(500).json({ message: "Bulk delete failed", error: err.message });
  }
});

module.exports = router;
