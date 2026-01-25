const mongoose = require("mongoose");

const testimonialSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    role: { type: String },
    review: { type: String, required: true },
    image: { type: String },
    rating: { type: Number, min: 1, max: 5, default: 5 },
    approved: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Testimonial", testimonialSchema);
