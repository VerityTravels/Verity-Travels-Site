// functions/api/subscribe.js
// Cloudflare Pages Function — handles email capture from the site's opt-in form.
// Adds the contact to your Resend account's Audience and sends them the checklist PDF.
//
// Required environment variables (set in Cloudflare Pages > Settings > Environment variables):
//   RESEND_API_KEY   - same key already used for /api/inquiry.js
//   NOTIFY_FROM      - e.g. "Verity Travel <hello@veritytravels.com>"
//   CHECKLIST_URL     - public URL of the hosted "Smart Cruise Planning Checklist" PDF
//
// Note: current Resend accounts have a single account-wide Audience (no separate
// Audience ID needed) — contacts are created directly via POST /contacts.

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { email } = await request.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Invalid email' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1. Add the contact to your Resend Audience (no audience ID needed on current API)
    const contactRes = await fetch('https://api.resend.com/contacts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email,
        unsubscribed: false,
      }),
    });

    // Resend returns 409 if the contact already exists — treat that as success, not an error
    if (!contactRes.ok && contactRes.status !== 409) {
      const errText = await contactRes.text();
      console.error('Resend contact error:', errText);
      return new Response(JSON.stringify({ error: 'Could not save contact' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Send the checklist as a transactional email (separate from Broadcasts)
    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.NOTIFY_FROM,
        to: email,
        subject: 'Your Smart Cruise Planning Checklist',
        html: `
          <div style="font-family: Georgia, serif; color: #1B2A4A; max-width: 480px; margin: 0 auto;">
            <h2 style="color:#1B2A4A;">Here's your checklist</h2>
            <p>Thanks for signing up. Here's the guide we walk every client through before booking:</p>
            <p style="margin: 24px 0;">
              <a href="${env.CHECKLIST_URL}"
                 style="background:#B8964F;color:#fff;padding:12px 24px;border-radius:4px;text-decoration:none;">
                 Download the Checklist
              </a>
            </p>
            <p>Planning something specific already? Just reply to this email — happy to help.</p>
            <p style="margin-top:32px;">— Verity Travel<br/>Travel, Thoughtfully Planned</p>
          </div>
        `,
      }),
    });

    if (!sendRes.ok) {
      const errText = await sendRes.text();
      console.error('Resend send error:', errText);
      // Contact was still saved to the audience, so don't fail the whole request
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Subscribe function error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
