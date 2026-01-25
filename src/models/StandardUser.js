
const mongoose = require("mongoose");
const BaseUser = require("./User");
const bcrypt = require("bcryptjs");

const standardUserSchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true },
  password: { type: String, required: true },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
  verificationToken: { type: String },
  verificationTokenExpires: Date,
  isVerified: { type: Boolean, default: false },

  // NEW FIELDS FOR OTP:
  otp: { type: String },
  otpExpires: { type: Date },
  otpAttempts: { type: Number, default: 0 },
  otpLastSent: { type: Date, default: null },

  // Role Matrix Field:
  role: { type: String, enum: ["Guest", "Verified", "Admin"], default: "Guest" }
});


// standardUserSchema.pre("save", async function (next) {
//   if (!this.isModified("password")) return next();
//   const salt = await bcrypt.genSalt(10);
//   this.password = await bcrypt.hash(this.password, salt);
//   next();
// });

const StandardUser = BaseUser.discriminator("StandardUser", standardUserSchema);
module.exports = StandardUser;
