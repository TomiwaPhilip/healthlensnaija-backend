// routes/transcribe.js
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const openai = require("../config/openai");
const { toFile } = require("openai"); // ⬅️ import helper

const upload = multer({ dest: "uploads/" });
const router = express.Router();

router.post("/", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No audio file uploaded" });
    }

    const filePath = path.resolve(req.file.path);
    const origName = req.file.originalname || "recording.wav";
    const contentType = req.file.mimetype || "audio/wav";

    console.log("🎙️ Received audio file:", {
      originalName: origName,
      mimeType: contentType,
      path: filePath,
      size: req.file.size,
    });

    // Wrap the stream with a filename + contentType
    const file = await toFile(fs.createReadStream(filePath), origName, {
      contentType,
    });

    // Use a widely-supported model for STT
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
    });

    fs.unlink(filePath, (err) => {
      if (err) console.warn("⚠️ Failed to delete temp audio file:", err.message);
    });

    console.log("✅ Transcription success");
    res.json({ transcript: transcription.text });
  } catch (err) {
    console.error("❌ Transcription failed:", err);
    res.status(500).json({
      message: "Transcription failed",
      error: err.message,
      details: err.response?.data || null,
    });
  }
});

module.exports = router;
