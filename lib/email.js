'use strict';

function parseSender(emailFrom) {
  const match = String(emailFrom || '').match(/^(.*?)\s*<(.+?)>$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { email: String(emailFrom || '').trim() };
}

async function sendEmail(to, subject, text, opts = {}) {
  if (!to || !process.env.BREVO_API_KEY) return;
  const sender = parseSender(process.env.EMAIL_FROM);
  const payload = {
    sender,
    to: [{ email: to }],
    subject,
    textContent: text,
  };
  if (opts.cc) {
    payload.cc = String(opts.cc).split(',').map(e => ({ email: e.trim() })).filter(e => e.email);
  }
  if (opts.html) {
    payload.htmlContent = opts.html;
  }
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('[email] Brevo error:', err);
    }
  } catch (err) {
    console.error('[email] Failed to send to', to, ':', err.message);
  }
}

module.exports = { sendEmail };
