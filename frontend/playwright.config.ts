import { defineConfig, devices } from "@playwright/test";

const python = process.platform === "win32" ? ".venv\\Scripts\\python.exe" : ".venv/bin/python";
export default defineConfig({
  testDir: "./tests", fullyParallel: false, workers: 1, timeout: 45_000,
  expect: { timeout: 10_000 }, reporter: "list",
  use: { baseURL: "http://127.0.0.1:5174", trace: "retain-on-failure", ...devices["Desktop Chrome"] },
  webServer: [
    { command: `${python} -m uvicorn tests.browser_server:app --host 127.0.0.1 --port 8001`, cwd: "../backend",
      env: { LEDA_E2E: "1" }, url: "http://127.0.0.1:8001/healthz", reuseExistingServer: false, timeout: 60_000 },
    { command: "npm run dev -- --host 127.0.0.1 --port 5174 --strictPort", env: { LEDA_API_TARGET: "http://127.0.0.1:8001" },
      url: "http://127.0.0.1:5174", reuseExistingServer: false, timeout: 60_000 },
  ],
});
