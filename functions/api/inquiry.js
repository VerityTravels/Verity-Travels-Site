// Cloudflare Pages Function
// Handles POST /api/inquiry — receives the trip inquiry form and emails it via Resend.
//
// SETUP REQUIRED before this works:
// 1. Create a free account at https://resend.com
// 2. Verify your sending domain (veritytravels.com) in Resend — this adds a couple of DNS
//    records at your domain registrar / Cloudflare DNS. Takes a few minutes to propagate.
// 3. Create an API key in Resend.
// 4. In the Cloudflare Pages project settings -> Environment variables, add:
//      RESEND_API_KEY   = <your Resend API key>
//      NOTIFY_TO        = hello@veritytravels.com   (or wherever inquiries should land)
//      NOTIFY_FROM      = inquiries@veritytravels.com  (must be on the verified domain)
//
// Until RESEND_API_KEY is set, this function will return a clear error instead of
// silently failing, so the front-end can tell the visitor something went wrong.

export async function onRequestPost(context) {
  const { request, env } = context;

  let data;
  try {
    data = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400);
  }

  // Basic required-field validation (mirrors the front-end)
  const required = ['fullName', 'email', 'tripType', 'budget'];
  for (const field of required) {
    if (!data[field] || String(data[field]).trim() === '') {
      return jsonResponse({ error: `Missing required field: ${field}` }, 400);
    }
  }

  // Very basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return jsonResponse({ error: 'Invalid email address' }, 400);
  }

  if (!env.RESEND_API_KEY) {
    return jsonResponse(
      { error: 'Email sending is not configured yet (missing RESEND_API_KEY).' },
      500
    );
  }

  const notifyTo = env.NOTIFY_TO || 'hello@veritytravels.com';
  const notifyFrom = env.NOTIFY_FROM || 'inquiries@veritytravels.com';

  const html = renderEmailHtml(data);

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: `Verity Travel Site <${notifyFrom}>`,
      to: [notifyTo],
      reply_to: data.email,
      subject: `New trip inquiry — ${data.fullName} (${data.tripType})`,
      html
    })
  });

  if (!resendRes.ok) {
    const errText = await resendRes.text();
    return jsonResponse({ error: 'Failed to send email', detail: errText }, 502);
  }

  return jsonResponse({ ok: true }, 200);
}

function renderEmailHtml(data) {
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const list = (arr) => (Array.isArray(arr) && arr.length ? arr.map(esc).join(', ') : '—');

  return `
    <div style="font-family: Georgia, serif; color:#1B2A4A; max-width:560px;">
      <h2 style="margin-bottom:4px;">New Trip Inquiry</h2>
      <p style="color:#6B6558; margin-top:0;">Submitted via veritytravels.com</p>
      <table style="width:100%; border-collapse:collapse; font-family: Arial, sans-serif; font-size:14px;">
        <tr><td style="padding:8px 0; font-weight:bold; width:180px;">Full name</td><td>${esc(data.fullName)}</td></tr>
        <tr><td style="padding:8px 0; font-weight:bold;">Email</td><td>${esc(data.email)}</td></tr>
        <tr><td style="padding:8px 0; font-weight:bold;">Phone</td><td>${esc(data.phone) || '—'}</td></tr>
        <tr><td style="padding:8px 0; font-weight:bold;">Preferred contact</td><td>${list(data.contactMethod)}</td></tr>
        <tr><td style="padding:8px 0; font-weight:bold;">Trip type</td><td>${esc(data.tripType)}</td></tr>
        <tr><td style="padding:8px 0; font-weight:bold;">Destination(s)</td><td>${esc(data.destinations) || '—'}</td></tr>
        <tr><td style="padding:8px 0; font-weight:bold;">Dates</td><td>${esc(data.dates) || '—'}</td></tr>
        <tr><td style="padding:8px 0; font-weight:bold;">Travelers</td><td>${esc(data.travelers) || '—'}</td></tr>
        <tr><td style="padding:8px 0; font-weight:bold;">Budget</td><td>${esc(data.budget)}</td></tr>
        <tr><td style="padding:8px 0; font-weight:bold;">Priorities</td><td>${list(data.priorities)}</td></tr>
        <tr><td style="padding:8px 0; font-weight:bold;">Notes</td><td>${esc(data.notes) || '—'}</td></tr>
        <tr><td style="padding:8px 0; font-weight:bold;">Heard about us via</td><td>${esc(data.referral) || '—'}</td></tr>
      </table>
    </div>
  `;
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
