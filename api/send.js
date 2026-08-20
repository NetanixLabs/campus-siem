/**
 * POST /api/send — Vercel serverless function.
 *
 * Relays an incident notification to Resend. The API key is read from the
 * RESEND_API_KEY environment variable and never leaves the server, which is
 * why this route exists at all: Resend keys are account-wide credentials and
 * would let anyone send mail as you if they shipped in the page bundle.
 *
 * Configure in Vercel:
 *   Project -> Settings -> Environment Variables
 *     RESEND_API_KEY   re_xxxxxxxx        (required)
 *     ALERT_FROM       Campus SIEM <onboarding@resend.dev>
 *     ALERT_TO         keedhecker@gmail.com
 *
 * Without a verified domain Resend only delivers to the address the account
 * was created with, so ALERT_TO should be that address. To reach other
 * recipients, verify a domain at resend.com/domains and point ALERT_FROM at it.
 */

const DEFAULT_FROM = 'Campus SIEM <onboarding@resend.dev>';

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return res.status(500).json({
      error: 'RESEND_API_KEY is not set. Add it in Vercel under Project -> Settings -> Environment Variables, then redeploy.'
    });
  }

  // Vercel parses JSON bodies automatically, but be tolerant of a raw string.
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); }
    catch (e) { return res.status(400).json({ error: 'Request body is not valid JSON.' }); }
  }
  body = body || {};

  const to = (body.to || process.env.ALERT_TO || '').trim();
  const subject = (body.subject || '').trim();
  if (!to) return res.status(400).json({ error: 'No recipient. Pass "to", or set ALERT_TO.' });
  if (!subject) return res.status(400).json({ error: 'No subject.' });
  if (!body.html && !body.text) return res.status(400).json({ error: 'No message content.' });

  const payload = {
    from: process.env.ALERT_FROM || DEFAULT_FROM,
    to: [to],
    subject,
    // Both parts so clients that refuse HTML still render the report.
    text: body.text || undefined,
    html: body.html || undefined
  };
  if (body.cc && body.cc.trim()) payload.cc = [body.cc.trim()];
  if (body.priority === 'high') {
    payload.headers = { 'X-Priority': '1', 'Importance': 'high' };
  }

  let upstream, json;
  try {
    upstream = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    json = await upstream.json().catch(() => null);
  } catch (err) {
    return res.status(502).json({ error: 'Could not reach Resend: ' + err.message });
  }

  if (!upstream.ok) {
    // Surface Resend's own message — it is specific and actionable, e.g. the
    // "you can only send to your own address until you verify a domain" case.
    return res.status(upstream.status).json({
      error: (json && (json.message || json.name)) || `Resend returned ${upstream.status}`
    });
  }

  return res.status(200).json({ ok: true, id: json && json.id });
};
