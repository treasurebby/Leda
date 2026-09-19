import emailjs from "@emailjs/browser";
import { EMAIL_CONFIG, isEmailConfigured } from "../config/email";

/* ------------------------------------------------------------------ validation */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const isValidEmail = (value: string) => EMAIL_RE.test(value.trim());

/* ------------------------------------------------------------------ helpers */
const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const NEXT_STEPS = [
  {
    title: "Product updates",
    body: "We will send you short, useful updates as we build. No spam, ever.",
  },
  {
    title: "Your early access invite",
    body: "When your slot opens, you will receive an email with your sign-in link and a guided setup.",
  },
  {
    title: "Onboarding help",
    body: "Our team will help you import your catalog and connect WhatsApp in a single afternoon.",
  },
];

/* ------------------------------------------------------------------ email content */
export const WELCOME_SUBJECT = "Congratulations, you're on the Leda waitlist";

/**
 * Branded HTML confirmation email. Table based with inline styles so it
 * renders correctly in Gmail, Outlook, Apple Mail and Yahoo.
 */
export function buildWelcomeHtml(email: string) {
  const { brand } = EMAIL_CONFIG;
  const safeEmail = escapeHtml(email);

  const steps = NEXT_STEPS.map(
    (s, i) => `
      <tr>
        <td valign="top" style="padding:0 14px 18px 0;width:28px;">
          <span style="display:inline-block;width:28px;height:28px;line-height:28px;border-radius:8px;background:#065F46;color:#FDFBF7;font:700 12px/28px Inter,Helvetica,Arial,sans-serif;text-align:center;">${i + 1}</span>
        </td>
        <td valign="top" style="padding:0 0 18px 0;">
          <p style="margin:0 0 3px 0;font:700 15px/22px Inter,Helvetica,Arial,sans-serif;color:#064E3B;">${s.title}</p>
          <p style="margin:0;font:400 14px/22px Inter,Helvetica,Arial,sans-serif;color:#4B5F57;">${s.body}</p>
        </td>
      </tr>`
  ).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${WELCOME_SUBJECT}</title>
</head>
<body style="margin:0;padding:0;background:#F6F1E7;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">You are officially on the Leda waitlist. Here is what happens next.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F1E7;">
    <tr>
      <td align="center" style="padding:36px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- brand -->
          <tr>
            <td style="padding:0 8px 18px 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:34px;height:34px;border-radius:10px;background:#065F46;text-align:center;vertical-align:middle;">
                    <span style="display:inline-block;width:10px;height:10px;border-radius:10px;background:#D97706;"></span>
                  </td>
                  <td style="padding-left:10px;font:800 19px/34px Inter,Helvetica,Arial,sans-serif;color:#064E3B;letter-spacing:-0.3px;">${brand.name}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- card -->
          <tr>
            <td style="background:#FFFFFF;border-radius:16px;padding:40px 40px 32px 40px;">
              <p style="margin:0 0 14px 0;font:700 11px/16px Inter,Helvetica,Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#B45309;">Waitlist confirmed</p>
              <h1 style="margin:0 0 16px 0;font:900 30px/36px Inter,Helvetica,Arial,sans-serif;letter-spacing:-0.6px;color:#064E3B;">Congratulations, you&rsquo;re on the list.</h1>
              <p style="margin:0 0 14px 0;font:400 16px/26px Inter,Helvetica,Arial,sans-serif;color:#33473F;">
                Thank you for joining the ${brand.name} waitlist. You are now in line for early access to the platform that turns WhatsApp voice notes, photos and market slang into structured orders and a clean, balanced ledger.
              </p>
              <p style="margin:0 0 28px 0;font:400 16px/26px Inter,Helvetica,Arial,sans-serif;color:#33473F;">
                We registered <strong style="color:#064E3B;">${safeEmail}</strong> and will keep you updated at this address.
              </p>

              <p style="margin:0 0 16px 0;font:700 13px/18px Inter,Helvetica,Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;color:#6B7F77;">What happens next</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${steps}
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 28px 0;">
                <tr>
                  <td style="border-radius:12px;background:#065F46;">
                    <a href="${brand.siteUrl}" style="display:inline-block;padding:14px 24px;font:700 14px/20px Inter,Helvetica,Arial,sans-serif;color:#FDFBF7;text-decoration:none;border-radius:12px;">See how ${brand.name} decodes an order</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font:400 14px/22px Inter,Helvetica,Arial,sans-serif;color:#4B5F57;">
                Have a question, or a WhatsApp ordering headache you would love us to solve first? Simply reply to this email. A real person reads every message.
              </p>
            </td>
          </tr>

          <!-- footer -->
          <tr>
            <td style="padding:22px 12px 0 12px;font:400 12px/19px Inter,Helvetica,Arial,sans-serif;color:#7C8D86;text-align:center;">
              ${brand.company} &middot; ${brand.address}<br>
              You received this email because ${safeEmail} joined the waitlist at <a href="${brand.siteUrl}" style="color:#065F46;text-decoration:underline;">${brand.siteUrl.replace(/^https?:\/\//, "")}</a>.
              If this was not you, you can ignore this message.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Plain text fallback for templates that use {{message}} instead of HTML. */
export function buildWelcomeText(email: string) {
  const { brand } = EMAIL_CONFIG;
  const steps = NEXT_STEPS.map((s, i) => `${i + 1}. ${s.title}: ${s.body}`).join("\n");
  return [
    "Congratulations, you're on the Leda waitlist.",
    "",
    `Thank you for joining ${brand.name}. You are now in line for early access to the platform that turns WhatsApp voice notes, photos and market slang into structured orders and a clean, balanced ledger.`,
    `We registered ${email} and will keep you updated at this address.`,
    "",
    "What happens next",
    steps,
    "",
    "Have a question? Simply reply to this email. A real person reads every message.",
    "",
    `${brand.company} · ${brand.address}`,
  ].join("\n");
}

/* ------------------------------------------------------------------ send */
export type JoinResult = { mode: "sent" | "demo" };

export async function joinWaitlist(rawEmail: string): Promise<JoinResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!isValidEmail(email)) throw new Error("INVALID_EMAIL");

  const { brand } = EMAIL_CONFIG;
  const params = {
    to_email: email,
    email,
    subject: WELCOME_SUBJECT,
    message_html: buildWelcomeHtml(email),
    message: buildWelcomeText(email),
    from_name: brand.name,
    reply_to: brand.replyTo,
    joined_at: new Date().toLocaleString("en-NG", { timeZone: "Africa/Lagos" }),
    source: typeof window !== "undefined" ? window.location.href : brand.siteUrl,
  };

  /* Demo mode: EmailJS keys not yet configured. UI succeeds, nothing is sent. */
  if (!isEmailConfigured()) {
    console.warn(
      "[Leda] Waitlist email not sent: EmailJS is not configured. " +
        "Add your keys to src/config/email.ts or .env (see docs/EMAIL_SETUP.md)."
    );
    await new Promise((r) => setTimeout(r, 900));
    return { mode: "demo" };
  }

  const options = { publicKey: EMAIL_CONFIG.publicKey, blockHeadless: true };

  /* 1. Confirmation email to the subscriber (must succeed). */
  await emailjs.send(
    EMAIL_CONFIG.serviceId,
    EMAIL_CONFIG.welcomeTemplateId,
    params,
    options
  );

  /* 2. Optional internal notification to the team (never blocks the user). */
  if (EMAIL_CONFIG.notifyTemplateId) {
    emailjs
      .send(EMAIL_CONFIG.serviceId, EMAIL_CONFIG.notifyTemplateId, params, options)
      .catch((err) => console.warn("[Leda] Team notification failed:", err));
  }

  return { mode: "sent" };
}
