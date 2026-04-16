'use strict';
const nodemailer = require('nodemailer');

let _transporter = null;

function getTransporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return _transporter;
}

/**
 * Send an email.
 * @param {string} to - recipient address
 * @param {string} subject
 * @param {string} text - plain-text body
 * @param {{ cc?: string }} [opts]
 */
async function sendEmail(to, subject, text, opts = {}) {
  if (!to || !process.env.SMTP_USER) return;
  try {
    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to,
      cc: opts.cc || undefined,
      subject,
      text,
    });
  } catch (err) {
    console.error('[email] Failed to send to', to, ':', err.message);
  }
}

module.exports = { sendEmail };
