/**
 * Waitlist email configuration (EmailJS).
 *
 * Two ways to configure:
 *   1. Add the VITE_EMAILJS_* variables to a `.env` file (see `.env.example`), or
 *   2. Paste the values directly into the strings below.
 *
 * Full setup walkthrough: docs/EMAIL_SETUP.md
 */
const env = import.meta.env;

export const EMAIL_CONFIG = {
  /** EmailJS > Account > General > Public Key */
  publicKey: (env.VITE_EMAILJS_PUBLIC_KEY as string | undefined) || "",
  /** EmailJS > Email Services > your connected mailbox > Service ID */
  serviceId: (env.VITE_EMAILJS_SERVICE_ID as string | undefined) || "",
  /** Template that welcomes the subscriber (To Email = {{to_email}}) */
  welcomeTemplateId: (env.VITE_EMAILJS_WELCOME_TEMPLATE_ID as string | undefined) || "",
  /** Optional: template that notifies the Leda team of a new signup */
  notifyTemplateId: (env.VITE_EMAILJS_NOTIFY_TEMPLATE_ID as string | undefined) || "",

  /** Brand details used inside the confirmation email */
  brand: {
    name: "Leda",
    replyTo: "hello@leda.africa",
    siteUrl: "https://leda.africa",
    address: "12B Ogunlana Drive, Surulere, Lagos",
    company: "Leda Technologies Ltd",
  },
} as const;

export const isEmailConfigured = () =>
  Boolean(
    EMAIL_CONFIG.publicKey &&
      EMAIL_CONFIG.serviceId &&
      EMAIL_CONFIG.welcomeTemplateId
  );
