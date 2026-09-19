# Sign In

The sign-in page is available at `#/signin` and linked from the landing-page
navigation. Dashboard sign-out clears the local preview session before returning
to this route.

## Included interaction

- Email validation, password-length validation and show/hide password control.
- Remember This Device uses `localStorage`; an unchecked choice uses
  `sessionStorage` instead.
- Valid local preview credentials open `#/dashboard` after a short loading state.
- Forgot Password displays an honest preview notice rather than pretending a
  recovery email was delivered.
- Create Your Distributor Workspace links to onboarding.

## Production boundary

This page must not be used as production authentication. It does not validate a
password against a server, rate-limit attempts, provide recovery email delivery,
or create a session token. Connect a real identity provider over HTTPS, store
only a secure session token, enforce throttling/MFA where appropriate, and remove
the preview disclosure only after those controls exist.