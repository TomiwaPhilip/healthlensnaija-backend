// const express = require("express");
// const Story = require("../models/Story");
// const checkRole = require("../middlewares/auth");

// const router = express.Router();

// // ✅ Approve a story
// router.put("/:id/approve", checkRole(["Admin"]), async (req, res) => {
//   try {
//     const story = await Story.findById(req.params.id);

//     if (!story) {
//       return res.status(404).json({ message: "Story not found" });
//     }

//     story.approvalStatus = "Approved";
//     await story.save();

//     res.status(200).json({ message: "Story approved successfully!", story });
//   } catch (error) {
//     console.error("Approval Error:", error.message);
//     res.status(500).json({ message: "Error approving story", error: error.message });
//   }
// });

// // ✅ Reject a story
// router.put("/:id/reject", checkRole(["Admin"]), async (req, res) => {
//   try {
//     const story = await Story.findById(req.params.id);

//     if (!story) {
//       return res.status(404).json({ message: "Story not found" });
//     }

//     story.approvalStatus = "Rejected";
//     await story.save();

//     res.status(200).json({ message: "Story rejected successfully!", story });
//   } catch (error) {
//     console.error("Rejection Error:", error.message);
//     res.status(500).json({ message: "Error rejecting story", error: error.message });
//   }
// });

// module.exports = router;
