require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const passport = require("passport");
const cron = require("node-cron");
const session = require("express-session");
const cors = require("cors");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
const storyInteractionRoutes = require("./routes/storyInteractions");


const syncRoutes = require("./routes/syncRoutes");
const storyRoutes = require("./routes/storyRoutes");
const searchRoutes = require("./routes/searchRoutes");
const generateRoutes = require("./routes/generateRoutes");
const apiLimiter = require("./middlewares/rateLimit");
const fineTuneRoutes = require("./routes/fineTuneRoutes");
const chatRoutes = require("./routes/chatRoutes");
const adminDashboardRoutes = require("./routes/adminDashboardRoutes");
const statsRouter = require("./routes/statsRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const reportsRoutes = require("./routes/reportsRoutes");
const recentActivityRoutes = require("./routes/recentActivity");
const overviewRoutes = require("./routes/overview");
const fileUpload = require("express-fileupload");
const contactRoutes = require("./routes/contactRoutes");
const documentRoutes = require("./routes/documents");
require("./workers/storyWorker");


const uploadRoute = require("./routes/uploadRoute");
// const search = require("./routes/search");
require("./cron/ingestCron");
const roleRoutes = require("./routes/roleRoutes");

const runAlertsCron = require("./cron/alertsCron");

require("./config/passport");
const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const openSearchRoutes = require("./routes/openSearchRoute");
const chatgptRoutes = require("./routes/chatgptRoutes");
const userRoutes = require("./routes/userRoutes");
const supportRoutes = require("./routes/supportRoutes");
const trainingRoutes = require("./routes/trainingRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

// 👇 create HTTP server for socket.io
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      "https://frontend-repo-vc6v.onrender.com",
      "https://frontend-repo-tnxf.onrender.com",
      "https://ns.pilot.nigeriahealthwatch.com",
      "https://pilot.nigeriahealthwatch.com",
      "http://localhost:3000",
      "http://localhost:5173",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  },
});

app.use(fileUpload()); 

// Make io available in routes
app.set("io", io);

io.on("connection", (socket) => {
  console.log("🔌 New socket connected:", socket.id);

  const { chatId, role } = socket.handshake.query || {};

  if (chatId) {
    socket.join(chatId);
    console.log(`✅ Auto-joined room: ${chatId}`);
  }

  if (role === "Admin") {
    socket.join("support:admin");
    console.log(`👑 Admin ${socket.id} joined support:admin room`);
  }

  socket.on("support:join", (id) => {
    if (id) {
      socket.join(id);
      console.log(`✅ Socket ${socket.id} joined support room ${id}`);
    }
  });

  socket.on("disconnect", () => {
    console.log("❌ Socket disconnected:", socket.id);
  });
});

app.set("trust proxy", 1);

// ❌ Removed AdminJS completely

(async () => {
  try {
    const corsOptions = {
      origin: (origin, callback) => {
       // Allow all origins for development
        return callback(null, true); 
      },
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    };

    cron.schedule("*/30 * * * *", runAlertsCron);

    app.use(cors(corsOptions));
    app.options(/.*/, cors(corsOptions));

    app.use((req, res, next) => {
      // console.log(`Incoming ${req.method} request to ${req.url}`);
      next();
    });

    app.use(
      session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
          secure: process.env.NODE_ENV === "production",
          sameSite: "none",
        },
      })
    );

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Routes
    app.use("/api/auth", authRoutes);
    app.use("/api/dashboard", dashboardRoutes);
    // app.use('/api/opensearch', openSearchRoutes);
    app.use("/api/chatgpt", chatgptRoutes);
    app.use("/api/sync", syncRoutes);
    app.use("/api/stories", storyRoutes);
    app.use("/api/search", searchRoutes);
    app.use("/api/generate-story", generateRoutes);
    app.use("/api/contact", contactRoutes);

    app.use("/api/fine-tune", fineTuneRoutes);
    console.log("🧭 Mounting Chat Routes at /api/chat");

    app.use("/api/users", userRoutes);
    app.use("/api/chat", chatRoutes);
    app.use("/api/admin-dashboard", adminDashboardRoutes);
    app.use("/api", statsRouter);
    app.use("/api/notifications", notificationRoutes);
    app.use("/api/reports", reportsRoutes);
    app.use("/api/recent-activity", recentActivityRoutes);
    app.use("/api/overview", overviewRoutes);
    app.use("/api/upload", uploadRoute);
    app.use("/api/tags", require("./routes/tags.routes"));
    app.use("/api/roles", roleRoutes);
    app.use("/uploads", express.static(path.join(__dirname, "uploads")));
    app.use("/api/training", trainingRoutes);
    app.use("/api/support", supportRoutes);
    app.use("/api/transcribe", require("./routes/transcribe"));
    app.use("/api/", apiLimiter);
    app.use("/api/testimonials", require("./routes/testimonialRoutes"));
    app.use("/api/test", require("./routes/testQueueRoute"));
    app.use("/api/stories", storyInteractionRoutes);
    app.use("/api/documents", documentRoutes);
    
    // MongoDB Connection
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected");

    // Start Server
    server.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Server startup error:", error);
  }
})();
