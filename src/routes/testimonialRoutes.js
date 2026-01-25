const express = require("express");
const router = express.Router();
const {
  createTestimonial,
  getTestimonials,
  getAllTestimonials,
  updateTestimonial,
  deleteTestimonial
} = require("../controllers/testimonialController");
const verifyToken = require("../middlewares/verifyToken");
const checkRole = require("../middlewares/checkRole");

// Public route
router.get("/", getTestimonials);

// Admin-only routes
router.get("/admin", verifyToken, checkRole(["Admin"]), getAllTestimonials);
router.post("/", verifyToken, checkRole(["Admin"]), createTestimonial);
router.put("/:id", verifyToken, checkRole(["Admin"]), updateTestimonial);
router.delete("/:id", verifyToken, checkRole(["Admin"]), deleteTestimonial);

module.exports = router;
