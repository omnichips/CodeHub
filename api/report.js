const RECIPIENT = 'omnipotentchips@gmail.com';
const MAX_SUMMARY = 160;
const MAX_DETAILS = 6000;

const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const reply = (res, status, body) => res.status(status).json(body);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return reply(res, 405, { error: 'Method not allowed' });
  }
  const key = process.env.RESEND_API_KEY;
  const sender = process.env.REPORT_FROM_EMAIL;
  if (!key || !sender) return reply(res, 503, { error: 'Issue reporting is not configured' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {};
  } catch {
    return reply(res, 400, { error: 'Invalid JSON' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(res, 400, { error: 'Invalid report' });
  const summary = text(body.summary, MAX_SUMMARY).replace(/[\r\n]+/g, ' ');
  const details = text(body.details, MAX_DETAILS);
  if (!summary || !details) return reply(res, 400, { error: 'Summary and details are required' });

  const message = [
    `Summary: ${summary}`,
    '',
    details,
    '',
    '--- Game context ---',
    `Build: ${text(body.build, 120) || 'unknown'}`,
    `Page: ${text(body.page, 500) || 'unknown'}`,
    `Browser: ${text(body.userAgent, 500) || 'unknown'}`,
    `Sent: ${new Date().toISOString()}`,
  ].join('\n');

  const sent = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: sender,
      to: [RECIPIENT],
      subject: `[Die Trying] ${summary}`,
      text: message,
    }),
  });
  if (!sent.ok) {
    console.error('Resend rejected issue report', sent.status, await sent.text());
    return reply(res, 502, { error: 'The report could not be sent' });
  }
  return reply(res, 200, { ok: true });
}
