require("dotenv").config();
const express = require("express");
const cors = require("cors");

const storyRoutes = require("./routes/newsroomStoryRoutes");
const chatRoutes = require("./routes/newsroomChatRoutes");
const { storyArtifactsRouter, artifactRouter } = require("./routes/newsroomArtifactRoutes");
const { storySourcesRouter, sourceRouter } = require("./routes/newsroomSourceRoutes");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const roleRoutes = require("./routes/roleRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

const corsOptions = {
  origin: (origin, callback) => callback(null, true),
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/stories", storyRoutes);
app.use("/api/stories", chatRoutes);
app.use("/api/stories", storyArtifactsRouter);
app.use("/api/stories", storySourcesRouter);
app.use("/api/artifacts", artifactRouter);
app.use("/api/sources", sourceRouter);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error("Unhandled error", err);
  res.status(500).json({ message: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`🚀 Newsroom backend running on port ${PORT}`);
});
