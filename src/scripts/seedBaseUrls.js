// scripts/seedTestimonials.js
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const connectDB = require("../config/db");
const Testimonial = require("../models/Testimonial");

const testimonials = [
  {
    name: "Dr. Sarah Johnson",
    role: "Medical Researcher",
    review:
      "This platform has transformed how I analyze health data. The AI-powered insights save me hours of work each week and help identify patterns I might have missed.",
    image: "https://randomuser.me/api/portraits/women/44.jpg",
    rating: 5,
  },
  {
    name: "Michael Chen",
    role: "Health Journalist",
    review:
      "As a journalist, I rely on accurate health information. This service provides me with up-to-date, verified data that makes my reporting more impactful.",
    image: "https://randomuser.me/api/portraits/men/32.jpg",
    rating: 5,
  },
  {
    name: "Amina Bello",
    role: "Public Health Official",
    review:
      "The visualization tools help us communicate complex health statistics to the public in ways they can understand. A game-changer for our outreach programs.",
    image: "https://randomuser.me/api/portraits/women/63.jpg",
    rating: 4,
  },
  {
    name: "David Wilson",
    role: "Hospital Administrator",
    review:
      "We've integrated this into our daily operations. The predictive analytics have helped us allocate resources more efficiently during peak periods.",
    image: "https://randomuser.me/api/portraits/men/75.jpg",
    rating: 5,
  },
  {
    name: "Grace Okafor",
    role: "NGO Director",
    review:
      "The customizable reports make it easy to share findings with our donors and stakeholders. It's become an essential tool for our health initiatives.",
    image: "https://randomuser.me/api/portraits/women/22.jpg",
    rating: 5,
  },
  {
    name: "James Adekunle",
    role: "Data Scientist",
    review:
      "I'm impressed by the platform's ability to process large datasets quickly while maintaining accuracy. The API integration makes it versatile for our needs.",
    image: "https://randomuser.me/api/portraits/men/86.jpg",
    rating: 4,
  },
];

async function seedTestimonials() {
  try {
    await connectDB();

    for (let t of testimonials) {
      const exists = await Testimonial.findOne({ name: t.name });
      if (!exists) {
        await Testimonial.create(t);
        console.log(`🌱 Inserted testimonial: ${t.name}`);
      } else {
        console.log(`⚡ Already exists: ${t.name}`);
      }
    }

    console.log("🎉 Testimonials seeding completed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error seeding testimonials:", err);
    process.exit(1);
  }
}

seedTestimonials();
