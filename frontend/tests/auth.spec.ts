import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

const password = "Browser password 9";
let sequence = 0;
function address() { return `browser-${Date.now()}-${++sequence}@example.com`; }
async function account(request: APIRequestContext) {
  const email = address();
  const response = await request.post("/api/v1/auth/register", { data: {
    email, password, full_name: "Ada Browser", phone: "08034051198", business_name: "Browser Wholesale", industry: "Foodstuff & groceries",
  } });
  expect(response.status()).toBe(201);
  const headers = { Authorization: `Bearer ${(await response.json()).access_token}` };
  await request.patch("/api/v1/business/bridge", { headers, data: { method: "virtual" } });
  await request.post("/api/v1/business/complete-setup", { headers });
  return { email, headers };
}
async function signIn(page: Page, email: string, secret = password) {
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(secret);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("protects deep links, rejects wrong passwords, restores a session, and signs out", async ({ page, request }) => {
  const { email } = await account(request);
  await page.goto("/#/order/LE-1041");
  await expect(page).toHaveURL(/signin\?next=/);
  await signIn(page, email, "Wrong password 8");
  await expect(page.getByRole("alert")).toContainText("Incorrect email or password");
  await page.getByLabel("Remember this device").uncheck();
  await signIn(page, email);
  await expect(page).toHaveURL(/#\/order\/LE-1041$/);
  const cookie = (await page.context().cookies()).find(item => item.name === "leda_refresh");
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.expires).toBe(-1);
  await page.goto("/#/dashboard");
  await expect(page.locator(".dash-user-copy strong").first()).toHaveText("Ada Browser");
  await page.evaluate(() => sessionStorage.removeItem("leda.access"));
  await page.reload();
  await expect(page.locator(".dash-user-copy strong").first()).toHaveText("Ada Browser");
  await page.getByRole("button", { name: "Sign out", exact: true }).first().click();
  await expect(page).toHaveURL(/#\/signin$/);
  await page.goto("/#/dashboard");
  await expect(page).toHaveURL(/signin/);
});

test("registers through onboarding and resumes the completed workspace after reload", async ({ page }) => {
  await page.goto("/#/signin");
  await page.getByRole("link", { name: "Create your distributor workspace" }).click();
  await page.getByLabel("Full name", { exact: true }).fill("Chika Browser");
  await page.getByLabel("Phone number", { exact: true }).fill("08034051198");
  await page.getByLabel("Email address", { exact: true }).fill(address());
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Business name", { exact: true }).fill("Chika Distribution");
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: "Foodstuff & groceries", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Keep the conversation going." })).toBeVisible();
  await page.getByRole("radio").last().click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Skip for later", exact: true }).click();
  await page.getByRole("button", { name: "I'll do this later", exact: true }).click();
  await page.getByRole("button", { name: "Finish setup", exact: true }).click();
  await page.getByRole("link", { name: "Open the Command Center" }).click();
  await expect(page.locator(".dash-user-copy strong").first()).toHaveText("Chika Browser");
  await page.reload();
  await expect(page.locator(".dash-business-copy strong").first()).toHaveText("Chika Distribution");
});

test("sends and consumes a reset link, rejects reuse, and logs in with the new password", async ({ page, request }) => {
  const { email } = await account(request);
  await page.goto("/#/signin");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox." })).toBeVisible();
  const messages = await (await request.get(`/api/test/mail?email=${encodeURIComponent(email)}`)).json();
  const link = messages[0].text.match(/http[^\s]+/)[0];
  await page.goto(link);
  await page.getByLabel("New password", { exact: true }).fill("Updated password 7");
  await page.getByLabel("Confirm new password", { exact: true }).fill("Updated password 7");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("heading", { name: "Your password is updated." })).toBeVisible();
  await page.goto(link);
  await page.reload();
  await page.getByLabel("New password", { exact: true }).fill("Another password 8");
  await page.getByLabel("Confirm new password", { exact: true }).fill("Another password 8");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("alert")).toContainText("invalid or expired");
  await page.getByRole("link", { name: "Back to sign in" }).click();
  await signIn(page, email, "Updated password 7");
  await expect(page).toHaveURL(/#\/dashboard$/);
  expect((await page.context().cookies()).find(item => item.name === "leda_refresh")!.expires).toBeGreaterThan(Date.now() / 1000);
});

test("accepts a team invitation and refreshes into the invited workspace", async ({ page, request }) => {
  const { headers } = await account(request);
  const email = address();
  expect((await request.post("/api/v1/team/invites", { headers, data: { email, role: "viewer" } })).status()).toBe(201);
  const messages = await (await request.get(`/api/test/mail?email=${encodeURIComponent(email)}`)).json();
  await page.goto(messages[0].text.match(/http[^\s]+/)[0]);
  await page.getByLabel("Your full name").fill("Tunde Viewer");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Join the team" }).click();
  await expect(page.locator(".dash-user-copy strong").first()).toHaveText("Tunde Viewer");
  await page.evaluate(() => sessionStorage.removeItem("leda.access"));
  await page.reload();
  await expect(page.locator(".dash-user-copy").first()).toContainText("Viewer");
});

test("shows a useful API failure and keeps the sign-in design usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/signin");
  await page.route("**/api/v1/auth/login", route => route.fulfill({ status: 502, contentType: "text/html", body: "<h1>Bad gateway</h1>" }));
  await signIn(page, "nobody@example.com");
  await expect(page.getByRole("alert")).toContainText("API is unavailable");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
