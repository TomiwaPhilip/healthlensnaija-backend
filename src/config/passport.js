const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const OAuthUser = require("../models/OAuthUser");
const BaseUser = require("../models/User");
const crypto = require("crypto");
const path = require("path");
const { Resend } = require("resend");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

// Email helper using Resend API
const sendMail = async (to, subject, html) => {
  try {
    const { data, error } = await resend.emails.send({
from: process.env.EMAIL_FROM, 
 // must be verified in Resend
      to,
      subject,
      html,
    });

    if (error) {
      console.error("Resend email error:", error);
      throw new Error(error.message || "Failed to send email via Resend");
    }

    return data;
  } catch (err) {
    console.error("Resend sendMail error:", err);
    throw err;
  }
};

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.BACKEND_URL}/api/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        let user = await BaseUser.findOne({ email });

        if (!user) {
          // create OAuth user
          const rawToken = crypto.randomBytes(32).toString("hex");
          const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
          const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

          user = await OAuthUser.create({
            firstName: profile.name.givenName || "GoogleUser",
            lastName: profile.name.familyName || "",
            email,
            provider: "google",
            providerId: profile.id,
            profilePicture: profile.photos[0]?.value,
            isVerified: false,
            role: "Guest",
            verificationToken: tokenHash,
            verificationTokenExpires: tokenExpiry,
          });

          // send verification email via Resend
          // const verifyUrl = `${process.env.FRONTEND_URL}/verify-email/${rawToken}`;
          // await sendMail(
          //   email,
          //   "📧 Please verify your email",
          //   `
          //     <p>Hello ${user.firstName},</p>
          //     <p>Thanks for signing in with Google. Please verify your email to complete registration:</p>
          //     <p><a href="${verifyUrl}">Verify my account</a></p>
          //   `
          // );

          user._needsVerificationEmail = { token: rawToken };
        }

        return done(null, user);
      } catch (err) {
        console.error("Google OAuth error:", err);
        return done(err, false);
      }
    }
  )
);

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser((id, done) => {
  BaseUser.findById(id)
    .then((user) => done(null, user))
    .catch((err) => done(err, null));
});

module.exports = passport;
