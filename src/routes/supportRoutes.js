const express = require("express");
const router = express.Router();
const verifyToken = require("../middlewares/verifyToken");
const checkRole = require("../middlewares/checkRole");
const SupportChat = require("../models/SupportChat");
const openai = require("../config/openai");
const FAQ = require("../models/FAQ");

// const nodemailer = require("nodemailer");
const User = require("../models/User");

const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

// Helper function to send email via Resend
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



// ---------- Predefined FAQs ----------
// const faqList = [
//   { question: "How do I reset my password?", answer: "Go to your account settings, click 'Reset Password', and follow the instructions." },
//   { question: "How can I contact support?", answer: "You can reach us directly via the live chat option or email us at support@nhw.org." },
//   { question: "Where can I find my past stories?", answer: "All your generated stories are saved under your dashboard > 'My Stories'." },
//   { question: "What is NHW?", answer: "NHW (Nigeria Health Watch) is a platform for health policy insights, storytelling, and citizen engagement." },
//   // Add more FAQs as needed...
// ];


function isSimilar(input, target) {
  // require at least 80% similarity or exact match, not just "includes"
  const normalizedInput = input.trim().toLowerCase();
  const normalizedTarget = target.trim().toLowerCase();

  if (normalizedInput === normalizedTarget) return true;
  if (normalizedInput.length < 5) return false; // don't match short words like "hi"

  return normalizedInput.includes(normalizedTarget) || normalizedTarget.includes(normalizedInput);
}

// Extra check to avoid sending junk AI answers
function aiAnswerIsSatisfactory(answer) {
  if (!answer) return false;
  const tooShort = answer.length < 10;
  const containsUnsure = /(don't know|not sure|uncertain|I'm not sure|I cannot)/i.test(answer);
  const isApology = /(sorry|apologize)/i.test(answer) && tooShort;
  
  return !tooShort && !containsUnsure && !isApology;
}

// Utils: emit to sockets (io attached on app)
function getIO(req) {
  return req.app.get("io");
}

// const transporter = nodemailer.createTransport({
//   service: "Gmail",
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASS,
//   },
// });

// ---------- FAQ (quick answer) ----------
// ---------- FAQ (AI-first answer) ----------
// In your support routes file
router.post("/faq", verifyToken, async (req, res) => {
  try {
    const { question = "" } = req.body;
    if (!question.trim()) {
      return res.status(400).json({ message: "Question is required" });
    }

    const lowerQuestion = question.trim().toLowerCase();

    // 1. Quick local responses for common questions
    const quickResponses = {
      "hello": "Hello! How can I help you with Healthlens Naija today?",
      "hi": "Hi there! What can I assist you with regarding our platform?",
      "help": "I can help you generate stories, download content, or connect you with a live agent. What do you need?",
      "thanks": "You're welcome! Is there anything else I can help with?",
      "thank you": "You're welcome! Is there anything else I can help with?",
    };

    for (const [key, response] of Object.entries(quickResponses)) {
      if (lowerQuestion.includes(key)) {
        return res.json({ answer: response, source: "quick" });
      }
    }

    // 2. Check DB FAQs first (fastest)
    const faqs = await FAQ.find();
    const predefined = faqs.find(f => isSimilar(lowerQuestion, f.question));
    if (predefined) {
      return res.json({ answer: predefined.answer, source: "faq" });
    }

    // 3. Only then call AI with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8 second timeout

    try {
      const messages = [
        {
          role: "system",
          content: `You are Healthlens Naija's helpful assistant. Be concise and direct. Answer in 1-2 sentences max. 
          Focus on: story generation, downloading content, platform navigation. 
          If unsure, say "I'm not sure about that — let me connect you with a live agent."`
        },
        { role: "user", content: question }
      ];

      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo", // Use faster model
        messages,
        max_tokens: 150, // Shorter responses
        temperature: 0.7,
      }, { signal: controller.signal });

      clearTimeout(timeout);

      const aiAnswer = completion.choices?.[0]?.message?.content?.trim();

      if (aiAnswerIsSatisfactory(aiAnswer)) {
        return res.json({ answer: aiAnswer, source: "ai" });
      }

      // 4. Fallback to human agent
      return res.json({
        answer: "I'm not sure about that — let me connect you with a live agent.",
        source: "human"
      });

    } catch (aiError) {
      clearTimeout(timeout);
      if (aiError.name === 'AbortError') {
        console.warn("AI request timed out");
        return res.json({
          answer: "I'm taking longer than usual to respond. Would you like to connect with a live agent?",
          source: "human"
        });
      }
      throw aiError;
    }

  } catch (err) {
    console.error("FAQ error:", err);
    return res.status(500).json({ 
      answer: "Sorry, I'm having trouble right now. Please try again or contact support.",
      source: "error" 
    });
  }
});



// ---------- Start / continue a support chat ----------
router.post("/chat/start", verifyToken, async (req, res) => {
  try {
    const { subject = "" } = req.body;
    const chat = await SupportChat.create({
      userId: req.user.id,
      subject: subject || "General inquiry",
      status: "open",
      messages: [{ user: "user", text: "New conversation started." }]
    });
    res.status(201).json(chat);
  } catch (err) {
    console.error("Start chat error:", err);
    res.status(500).json({ message: "Could not start chat", error: err.message });
  }
});

router.get("/chat/:id/messages", verifyToken, async (req, res) => {
  try {
    const chat = await SupportChat.findById(req.params.id);
    if (!chat) return res.status(404).json({ message: "Chat not found" });
    if (chat.userId.toString() !== req.user.id && req.user.role !== "Admin") {
      return res.status(403).json({ message: "Forbidden" });
    }
    res.json(chat.messages || []);
  } catch (err) {
    res.status(500).json({ message: "Fetch failed", error: err.message });
  }
});

// ---------- Post a message ----------
router.post("/chat/:id/messages", verifyToken, async (req, res) => {
  try {
    const { text = "", askAI = true } = req.body;
    if (!text.trim()) return res.status(400).json({ message: "Text is required" });

    const chat = await SupportChat.findById(req.params.id);
    if (!chat) return res.status(404).json({ message: "Chat not found" });

    const isAdmin = req.user.role === "Admin";
    if (!isAdmin && chat.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const sender = isAdmin ? "agent" : "user";
    const userMsg = { user: sender, text };

    chat.messages.push(userMsg);
    chat.lastMessageAt = new Date();
    await chat.save();

    const io = getIO(req);
  // After saving the message
io.to(chat.id).emit("support:new-message", { chatId: chat.id, message: userMsg });

// 👇 also emit to a global admin room
io.to("support:admin").emit("support:admin-new-message", { chatId: chat.id, message: userMsg });

    // 👇 ONLY send mail if it's from a user
    if (sender === "user") {
      const now = new Date();
      const shouldNotify =
        !chat.lastNotifiedAt || now - chat.lastNotifiedAt > 1000 * 60 * 5; // 5 min cooldown

      if (shouldNotify) {
        const admins = await User.find({ role: "Admin", suspended: { $ne: true } }).lean();

        for (const admin of admins) {
          if (!admin.email) continue;

          await sendMail(
            admin.email,
            `📨 New Support Message: ${chat.subject || "General inquiry"}`,
            `
              <div style="font-family:Arial,sans-serif;color:#333;">
                <p>Hello ${admin.firstName || "Admin"},</p>
                <p>You have a new message in the support chat <b>${chat.subject || "General inquiry"}</b>.</p>
                <blockquote style="border-left:3px solid #30B349;padding-left:10px;color:#555;">
                  ${userMsg.text}
                </blockquote>
                <p>
                  <a href="${process.env.FRONTEND_URL}/admin?tab=support&chat=${chat.id}" 
                     style="display:inline-block;padding:10px 16px;background:#30B349;color:#fff;
                            text-decoration:none;border-radius:6px;">
                    👉 Open Chat
                  </a>
                </p>
                <hr/>
                <p style="font-size:12px;color:#999;text-align:center;">
                  This is an automated alert from Healthlens Naija Support.
                </p>
              </div>
            `
          );
          
        }

        // update chat so we don’t spam
        chat.lastNotifiedAt = now;
        await chat.save();
      }
    }

    // AI auto-reply
   // disable AI in live support mode
let aiReply = null;
const shouldAI = false; 

    if (shouldAI) {
      const messages = [
        { role: "system", content: "You are Healthlens Naija support assistant. Be clear, brief, and kind. If account/billing/security is involved, recommend contacting an admin. If you aren't sure, ask a follow-up question." },
        ...chat.messages.map(m => ({ role: m.user === "user" ? "user" : "assistant", content: m.text })),
      ];

      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-5-mini",
          messages,
          max_completion_tokens: 300
        });
        aiReply = completion.choices?.[0]?.message?.content?.trim() || null;
      } catch (e) {
        console.warn("AI reply failed:", e.message);
      }

      if (aiReply) {
        const aiMsg = { user: "ai", text: aiReply };
        chat.messages.push(aiMsg);
        chat.lastMessageAt = new Date();
        await chat.save();
        io.to(chat.id).emit("support:new-message", { chatId: chat.id, message: aiMsg });
      }
    }

    return res.json({ ok: true, ai: aiReply });
  } catch (err) {
    console.error("Post message error:", err);
    return res.status(500).json({ message: "Failed to send message", error: err.message });
  }
});

// ---------- Admin list ----------
router.get("/admin/chats", verifyToken, checkRole(["Admin"]), async (req, res) => {
  try {
    const list = await SupportChat.find()
      .populate("userId", "firstName lastName email role")
      .sort({ updatedAt: -1 });
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: "Error fetching chats", error: err.message });
  }
});

// ---------- Update metadata ----------
router.put("/chat/:id/status", verifyToken, checkRole(["Admin"]), async (req, res) => {
  const { status } = req.body;
  const chat = await SupportChat.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!chat) return res.status(404).json({ message: "Chat not found" });
  const io = getIO(req);
  io.to(chat.id).emit("support:metadata-updated", { chatId: chat.id, status });
  res.json({ ok: true });
});

router.put("/chat/:id/priority", verifyToken, checkRole(["Admin"]), async (req, res) => {
  const { priority } = req.body;
  const chat = await SupportChat.findByIdAndUpdate(req.params.id, { priority }, { new: true });
  if (!chat) return res.status(404).json({ message: "Chat not found" });
  const io = getIO(req);
  io.to(chat.id).emit("support:metadata-updated", { chatId: chat.id, priority });
  res.json({ ok: true });
});

// ---------- Mark as read ----------
router.put("/chat/:id/read", verifyToken, checkRole(["Admin"]), async (req, res) => {
  const chat = await SupportChat.findById(req.params.id);
  if (!chat) return res.status(404).json({ message: "Chat not found" });

  chat.lastSeenAt = new Date();
  await chat.save();

  const io = getIO(req);
  io.to(chat.id).emit("support:seen", { chatId: chat.id, seenAt: chat.lastSeenAt });

  res.json({ ok: true });
});

// ---------- End chat ----------
router.put("/chat/:id/end", verifyToken, checkRole(["Admin"]), async (req, res) => {
  const chat = await SupportChat.findById(req.params.id);
  if (!chat) return res.status(404).json({ message: "Chat not found" });

  chat.status = "closed";

  // 👇 Add a closing message
  chat.messages.push({
    user: "system",
    text: "🔴 This conversation has been closed by the support team.",
    createdAt: new Date()
  });

  await chat.save();

  const io = getIO(req);
  io.to(chat.id).emit("support:ended", { chatId: chat.id, message: "This conversation has been closed by the support team." });

  res.json({ ok: true });
});


// ---------- Mail transcript ----------
router.post("/chat/:id/mail", verifyToken, checkRole(["Admin"]), async (req, res) => {
  try {
    const chat = await SupportChat.findById(req.params.id)
      .populate("userId", "email firstName lastName");
    if (!chat) return res.status(404).json({ message: "Chat not found" });

    const userEmail = chat.userId?.email;
    if (!userEmail) return res.status(400).json({ message: "User has no email" });

    // Build transcript HTML with nicer styling
    const transcriptHtml = `
      <div style="font-family: Arial, sans-serif; color: #333; max-width:600px; margin:0 auto;">
        <h2 style="background:#30B349; color:white; padding:12px; border-radius:6px; text-align:center;">
          Support Conversation Transcript
        </h2>
        <p><strong>Subject:</strong> ${chat.subject}</p>
        <p><strong>Status:</strong> ${chat.status}</p>
        <hr style="border:none; border-top:1px solid #ccc; margin:15px 0;" />

        <div style="margin-top:10px;">
          ${chat.messages.map(m => `
            <div style="
              margin:10px 0;
              padding:10px 14px;
              border-radius:10px;
              max-width:80%;
              ${m.user === "agent"
                ? "background:#e6f0ff; margin-left:auto; text-align:right;"
                : m.user === "ai"
                  ? "background:#f4f4f4; margin:0 auto; font-style:italic;"
                  : "background:#f1f1f1; text-align:left;"}
            ">
              <div style="font-size:13px; color:#555; margin-bottom:4px;">
                <b>${m.user.toUpperCase()}</b>
              </div>
              <div style="font-size:14px; line-height:1.4;">${m.text}</div>
              <div style="font-size:11px; color:#999; margin-top:6px;">
                ${new Date(m.createdAt || chat.updatedAt).toLocaleString()}
              </div>
            </div>
          `).join("")}
        </div>

        <hr style="border:none; border-top:1px solid #ccc; margin:20px 0;" />
        <p style="font-size:12px; color:#777; text-align:center;">
          This is an automated transcript from Healthlens Naija Support.<br/>
          If you need further help, just reply to this email.
        </p>
      </div>
    `;

    await sendMail(
      userEmail,
      `📩 Support Transcript - ${chat.subject}`,
      transcriptHtml
    );
    

    res.json({ ok: true, message: `Transcript sent to ${userEmail}` });
  } catch (err) {
    console.error("Mail transcript error:", err);
    res.status(500).json({ message: "Failed to send transcript", error: err.message });
  }
});



// --- Admin: list all FAQs ---
router.get("/faq/admin", verifyToken, checkRole(["Admin"]), async (req, res) => {
  try {
    const faqs = await FAQ.find().sort({ createdAt: -1 });
    res.json(faqs);
  } catch (err) {
    res.status(500).json({ message: "Failed to load FAQs", error: err.message });
  }
});

// --- Admin: add FAQ ---
router.post("/faq/admin", verifyToken, checkRole(["Admin"]), async (req, res) => {
  try {
    const { question, answer } = req.body;
    if (!question || !answer) return res.status(400).json({ message: "Question and Answer required" });
    const faq = await FAQ.create({ question, answer });
    res.status(201).json(faq);
  } catch (err) {
    res.status(500).json({ message: "Failed to add FAQ", error: err.message });
  }
});

// --- Admin: update FAQ ---
router.put("/faq/admin/:id", verifyToken, checkRole(["Admin"]), async (req, res) => {
  try {
    const { question, answer } = req.body;
    const faq = await FAQ.findByIdAndUpdate(req.params.id, { question, answer }, { new: true });
    if (!faq) return res.status(404).json({ message: "FAQ not found" });
    res.json(faq);
  } catch (err) {
    res.status(500).json({ message: "Failed to update FAQ", error: err.message });
  }
});

// --- Admin: delete FAQ ---
router.delete("/faq/admin/:id", verifyToken, checkRole(["Admin"]), async (req, res) => {
  try {
    await FAQ.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete FAQ", error: err.message });
  }
});

// GET /support/faq/list (public)
router.get("/faq/list", async (req, res) => {
  try {
    const faqs = await FAQ.find().sort({ createdAt: -1 }).lean();
    res.json(faqs);
  } catch (err) {
    console.error("FAQ list error:", err);
    res.status(500).json({ message: "Failed to load FAQs", error: err.message });
  }
});


module.exports = router;
