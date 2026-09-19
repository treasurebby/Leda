# Waitlist confirmation email setup (5 minutes)

The landing page is a static site with no server, so confirmation emails are sent
from the browser through [EmailJS](https://www.emailjs.com) (free tier, no card).
Until the keys below are added, the form runs in **demo mode**: the success
message shows, but no email is sent (a warning is printed in the console).

The email design itself lives in `src/lib/waitlist.ts` (`buildWelcomeHtml`), so
you can edit the copy in code. The EmailJS template only needs to pass it through.

---

## 1. Create the account and connect a mailbox

1. Sign up at <https://dashboard.emailjs.com>.
2. **Email Services → Add New Service** and connect the mailbox the emails should
   come from (Gmail, Outlook, Zoho, etc.), for example `hello@leda.africa`.
3. Copy the **Service ID** (looks like `service_abc123`).

## 2. Create the welcome template

**Email Templates → Create New Template**, then fill the fields exactly like this:

| Field        | Value                                   |
| ------------ | --------------------------------------- |
| To Email     | `{{to_email}}`                          |
| From Name    | `Leda`                                  |
| Reply To     | `hello@leda.africa`                     |
| BCC          | *(optional)* your inbox, to keep a copy of every signup |
| Subject      | `{{subject}}`                           |
| Content      | switch the editor to **Code** (the `</>` button), delete everything, and paste `{{{message_html}}}` |

Triple braces are important: they tell EmailJS not to escape the HTML.

Save and copy the **Template ID** (looks like `template_xyz789`).

## 3. Copy the public key

**Account → General → Public Key** (looks like `AbCdEfGhIjKlMnOpQ`).

## 4. Add the keys to the project

Either create a `.env` file in the project root:

```
VITE_EMAILJS_PUBLIC_KEY=AbCdEfGhIjKlMnOpQ
VITE_EMAILJS_SERVICE_ID=service_abc123
VITE_EMAILJS_WELCOME_TEMPLATE_ID=template_xyz789
```

…or paste the same three values straight into `src/config/email.ts`.

Then rebuild (`npm run build`). Vite inlines the values at build time.

## 5. Optional: get notified about every signup

Create a second template (e.g. subject `New Leda waitlist signup: {{email}}`,
To Email = your team inbox, content `{{email}} joined at {{joined_at}} from {{source}}`)
and add its ID as `VITE_EMAILJS_NOTIFY_TEMPLATE_ID`. It is sent in the background
and never blocks the subscriber's confirmation.

---

### Variables available in templates

| Variable           | Contents                                             |
| ------------------ | ---------------------------------------------------- |
| `to_email`, `email`| the subscriber's address                             |
| `subject`          | "Congratulations, you're on the Leda waitlist"       |
| `message_html`     | the full branded HTML email (use with triple braces) |
| `message`          | plain text version of the same email                 |
| `from_name`        | `Leda`                                               |
| `reply_to`         | `hello@leda.africa`                                  |
| `joined_at`        | timestamp in Africa/Lagos time                       |
| `source`           | page URL the signup came from                        |

### Notes

- The public key is safe to ship in the browser. Never put the EmailJS
  **private** key in this project.
- In the EmailJS dashboard you can whitelist your domain (Account → Security)
  so the key only works from your site.
- The form includes a honeypot field and EmailJS' headless-browser block to
  reduce bot signups.
