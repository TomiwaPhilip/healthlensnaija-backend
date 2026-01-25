// models/OAuthUser.js
const mongoose = require("mongoose");
const BaseUser = require("./User");

const oauthUserSchema = new mongoose.Schema({
  provider: { type: String, required: true },
  providerId: { type: String, required: true },

  // Add verification fields like StandardUser
  verificationToken: { type: String },
  verificationTokenExpires: Date,
  isVerified: { type: Boolean, default: false },
});

const OAuthUser = BaseUser.discriminator("OAuthUser", oauthUserSchema);
module.exports = OAuthUser;
