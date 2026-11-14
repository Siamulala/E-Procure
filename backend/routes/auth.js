const crypto = require("node:crypto");
const express = require("express");
const nodemailer = require("nodemailer");

const router = express.Router();
const resetCodes = new Map();
const requestLimits = new Map();
const codeLifetimeMs = 10 * 60 * 1000;
const rateLimitWindowMs = 15 * 60 * 1000;
const maxRequestsPerWindow = 3;

const hashCode = (email, code) =>
  crypto.createHash("sha256").update(`${email}:${code}`).digest("hex");

const isRateLimited = (key, now) => {
  const current = requestLimits.get(key);
  if (!current || current.expiresAt <= now) {
    requestLimits.set(key, { count: 1, expiresAt: now + rateLimitWindowMs });
    return false;
  }
  if (current.count >= maxRequestsPerWindow) return true;
  current.count += 1;
  return false;
};

router.post("/password-reset/request", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }

  const gmailUser = process.env.GMAIL_USER?.trim();
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
  if (!gmailUser || !gmailAppPassword) {
    return res.status(503).json({
      error: "Email delivery is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in backend/.env."
    });
  }

  const now = Date.now();
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  if (isRateLimited(`email:${email}`, now) || isRateLimited(`ip:${ip}`, now)) {
    return res.status(429).json({ error: "Too many reset requests. Please try again later." });
  }

  const code = crypto.randomInt(100000, 1000000).toString();
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailAppPassword }
  });

  try {
    await transporter.sendMail({
      from: `"Easy-Procure" <${gmailUser}>`,
      to: email,
      subject: "Your Easy-Procure password reset code",
      text: `Your password reset code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`
    });
  } catch (error) {
    console.error("Password reset email delivery failed:", error.message);
    return res.status(502).json({ error: "We couldn't send the reset email. Check the Gmail app-password settings and try again." });
  }

  resetCodes.set(email, {
    hash: hashCode(email, code),
    expiresAt: now + codeLifetimeMs,
    attempts: 0
  });
  return res.json({ message: "If an account exists for this address, a verification code has been sent." });
});

router.post("/password-reset/verify", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
  const newPassword = req.body?.newPassword;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: "Enter a valid email address and six-digit code." });
  }
  if (newPassword !== undefined && (typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 256)) {
    return res.status(400).json({ error: "The new password must contain between 8 and 256 characters." });
  }

  const reset = resetCodes.get(email);
  if (!reset || reset.expiresAt <= Date.now()) {
    resetCodes.delete(email);
    return res.status(400).json({ error: "The verification code is invalid or expired. Request a new code." });
  }

  reset.attempts += 1;
  const submittedHash = Buffer.from(hashCode(email, code), "hex");
  const matches = crypto.timingSafeEqual(Buffer.from(reset.hash, "hex"), submittedHash);
  if (!matches) {
    if (reset.attempts >= 5) resetCodes.delete(email);
    return res.status(400).json({ error: "The verification code is invalid or expired." });
  }

  if (newPassword !== undefined) {
    const apiUrl = process.env.ALWEN_API_URL?.trim().replace(/\/$/, "");
    const resetKey = process.env.ALWEN_PASSWORD_RESET_KEY?.trim();
    if (!apiUrl || !resetKey) {
      return res.status(503).json({
        error: "API password reset is not configured. Set ALWEN_API_URL and ALWEN_PASSWORD_RESET_KEY in backend/.env."
      });
    }
    try {
      const response = await fetch(`${apiUrl}/auth/password-reset/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Alwen-Password-Reset-Key": resetKey
        },
        body: JSON.stringify({ email, new_password: newPassword })
      });
      if (!response.ok) {
        console.error("API password reset failed with status:", response.status);
        return res.status(502).json({ error: "The API could not reset the password. Try again or contact an administrator." });
      }
    } catch (error) {
      console.error("API password reset request failed:", error.message);
      return res.status(502).json({ error: "The API could not be reached to reset the password. Try again later." });
    }
  }

  resetCodes.delete(email);
  return res.json({ message: "Email verified. You can now sign in with your new password." });
});

module.exports = router;
