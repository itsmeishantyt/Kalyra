/**
 * Mailer — Local Dev Mode
 *
 * In production: replace with Nodemailer + SMTP config.
 * In local mode:  reset tokens are returned directly in the API response.
 * Switch via env: RESET_MODE=local | email
 */

const RESET_MODE = process.env.RESET_MODE || 'local';

async function sendPasswordReset(user, resetToken) {
  const resetUrl = `http://localhost:${process.env.PORT || 3000}/api/v1/auth/reset-password?token=${resetToken}`;

  if (RESET_MODE === 'local') {
    // Dev mode: log to console & return token so it can be tested
    console.log('\n─────────────────────────────────────────');
    console.log('📧  [LOCAL DEV] Password Reset');
    console.log(`    To:    ${user.email}`);
    console.log(`    Token: ${resetToken}`);
    console.log(`    URL:   ${resetUrl}`);
    console.log('─────────────────────────────────────────\n');

    // Return the token so the API can include it in the response (dev only)
    return { localToken: resetToken, resetUrl };
  }

  // ── SMTP mode (configure when ready) ────────────────────
  // const nodemailer = require('nodemailer');
  // const transporter = nodemailer.createTransport({
  //   host: process.env.SMTP_HOST,
  //   port: process.env.SMTP_PORT,
  //   secure: process.env.SMTP_SECURE === 'true',
  //   auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  // });
  // await transporter.sendMail({
  //   from: `"Kalyra" <${process.env.SMTP_FROM}>`,
  //   to: user.email,
  //   subject: 'Reset your Kalyra password',
  //   html: `<p>Click <a href="${resetUrl}">here</a> to reset your password. Valid for 30 minutes.</p>`,
  // });
  return {};
}

async function sendWelcomeEmail(user) {
  if (RESET_MODE === 'local') {
    console.log(`📧  [LOCAL DEV] Welcome email → ${user.email}`);
    return;
  }
  // TODO: implement SMTP welcome email
}

module.exports = { sendPasswordReset, sendWelcomeEmail };
