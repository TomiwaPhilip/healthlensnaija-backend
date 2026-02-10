const express = require("express");
const router = express.Router();
const ContactMessage = require("../models/ContactMessage");
const verifyToken = require("../middlewares/verifyToken");
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

// ✅ Reusable email helper
const sendMail = async (to, subject, html) => {
  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM, // e.g. "Healthlens Naija <no-reply@yourdomain.com>"
    to: [to],
    subject,
    html,
  });

  if (error) {
    console.error("❌ Resend sendMail error:", error);
    throw new Error(error.message || "Failed to send email via Resend");
  }

  return data;
};

// POST /api/contact — Save message and send notification email
router.post("/", async (req, res) => {
  try {
    const { name, email, message } = req.body;

    if (!name || !email || !message)
      return res.status(400).json({ error: "All fields are required." });

    // Save message to DB
    const newMsg = await ContactMessage.create({ name, email, message });

    // Emit socket event to admins (for live dashboard updates)
    const io = req.app.get("io");
    if (io) {
      io.to("support:admin").emit("contact:new-message", {
        _id: newMsg._id,
        name: newMsg.name,
        email: newMsg.email,
        message: newMsg.message,
        createdAt: newMsg.createdAt,
        read: newMsg.read,
      });
    }

    // ✅ Send email notification to admin
    if (process.env.ADMIN_EMAIL) {
      await sendMail(
        process.env.ADMIN_EMAIL,
        `📩 New Message from ${name}`,
        `
          <h2>New Contact Message</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Message:</strong></p>
          <p>${message}</p>
        `
      );
    }

    return res
      .status(200)
      .json({ success: true, message: "Message sent successfully." });
  } catch (error) {
    console.error("❌ Contact form error:", error);
    return res.status(500).json({ error: "Server error." });
  }
});

// GET /api/contact — Fetch all messages (admin)
router.get("/", verifyToken, async (req, res) => {
  try {
    const messages = await ContactMessage.find().sort({ createdAt: -1 });
    res.json(messages);
  } catch (error) {
    console.error("❌ Error fetching contact messages:", error);
    res.status(500).json({ error: "Server error." });
  }
});

// PATCH /api/contact/:id/read — Mark as read
router.patch("/:id/read", verifyToken, async (req, res) => {
  try {
    const msg = await ContactMessage.findByIdAndUpdate(
      req.params.id,
      { read: true },
      { new: true }
    );
    res.json(msg);
  } catch (err) {
    console.error("❌ Error marking message as read:", err);
    res.status(500).json({ error: "Server error." });
  }
});

// DELETE /api/contact/:id — Delete a message
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    await ContactMessage.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Error deleting message:", err);
    res.status(500).json({ error: "Server error." });
  }
});

/**
 * POST /api/contact/:id/reply
 * Auth: Bearer token required (verifyToken)
 * Body: { text: string }
 */
router.post("/:id/reply", verifyToken, async (req, res) => {
  try {
    const { text } = req.body;
    const messageId = req.params.id;
    const { id: adminId, role } = req.user;

    // ✅ Allow only admin/support roles
    if (role !== "Admin" && role !== "Moderator") {
      return res.status(403).json({ error: "Access denied: insufficient permissions." });
    }

    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Reply text is required." });
    }

    // Find original message
    const msg = await ContactMessage.findById(messageId);
    if (!msg) return res.status(404).json({ error: "Contact message not found." });

    // Build reply object
    const replyObj = {
      adminId,
      adminName: req.user.name || "Admin",
      text,
      createdAt: new Date(),
    };

    // Update DB
    msg.replies.push(replyObj);
    msg.replied = true;
    msg.read = true;
    await msg.save();

    // ✅ Send reply email using Resend
    try {
      const fromName = process.env.FROM_NAME || "Healthlens Naija";
      const mailHtml = `
        <p>Hi ${msg.name},</p>
        <p>${text.replace(/\n/g, "<br/>")}</p>
        <hr />
        <p><strong>Your original message:</strong></p>
        <p style="white-space:pre-wrap;">${msg.message}</p>
        <p>— ${fromName}</p>
      `;

      await sendMail(
        msg.email,
        `Reply from ${fromName}`,
        mailHtml
      );

      console.log("✅ Reply email sent to:", msg.email);
    } catch (emailErr) {
      console.error("❌ Failed to send reply email via Resend:", emailErr);
    }

    // Emit socket update
    const io = req.app.get("io");
    if (io) {
      io.to("support:admin").emit("contact:message-updated", {
        id: msg._id,
        replied: true,
      });
    }

    return res.json({
      success: true,
      message: "Reply saved and emailed successfully.",
    });
  } catch (err) {
    console.error("❌ Error replying to contact message:", err);
    return res.status(500).json({ error: "Server error." });
  }
});

module.exports = router;
