import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const defaultLoginUrl = "https://sistema.enescena.com.ar/ingresar";

const loginUrl = process.env.EN_ESCENA_PERF_URL ?? defaultLoginUrl;
const email = process.env.EN_ESCENA_PERF_EMAIL;
const password = process.env.EN_ESCENA_PERF_PASSWORD;
const dbLatencyToken = process.env.EN_ESCENA_PERF_DB_TOKEN;
const iterations = readPositiveIntegerEnv("EN_ESCENA_PERF_ITERATIONS", 5);
const headless = process.env.EN_ESCENA_PERF_HEADLESS !== "0";

const navigationSteps = [
  { label: "Inicio", pathname: "/administracion" },
  { label: "Profesores", pathname: "/administracion/profesores" },
  { label: "Modalidades", pathname: "/administracion/modalidades" },
  { label: "Usuarios", pathname: "/administracion/usuarios" },
  { label: "Precios", pathname: "/administracion/precios" },
  { label: "Eventos", pathname: "/administracion/eventos" },
];

if (!email || !password) {
  throw new Error(
    "Set EN_ESCENA_PERF_EMAIL and EN_ESCENA_PERF_PASSWORD before running this script.",
  );
}

const { chromium } = await importPlaywright();
const browser = await chromium.launch({ headless });
const context = await browser.newContext({
  locale: "es-AR",
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const networkEvents = [];

page.on("request", (request) => {
  networkEvents.push({
    type: "request",
    at: performance.now(),
    method: request.method(),
    url: request.url(),
    resourceType: request.resourceType(),
  });
});

page.on("requestfinished", async (request) => {
  const response = await request.response();
  networkEvents.push({
    type: "requestfinished",
    at: performance.now(),
    method: request.method(),
    url: request.url(),
    resourceType: request.resourceType(),
    status: response?.status() ?? null,
  });
});

page.on("requestfailed", (request) => {
  networkEvents.push({
    type: "requestfailed",
    at: performance.now(),
    method: request.method(),
    url: request.url(),
    resourceType: request.resourceType(),
    failure: request.failure()?.errorText ?? null,
  });
});

const loginStart = performance.now();
await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
await waitForSettledUi(page);
await page.getByLabel("Correo electrónico").fill(email);
await page.getByLabel("Contraseña").fill(password);
try {
  await Promise.all([
    page.waitForURL((url) => url.pathname.startsWith("/administracion"), {
      timeout: 30_000,
    }),
    page.getByRole("button", { name: "Ingresar" }).click(),
  ]);
} catch (error) {
  const visibleText = await page.locator("body").innerText({ timeout: 5_000 });
  const loginRequests = summarizeRequestsBetween(loginStart, performance.now());

  console.error("Login did not reach /administracion.");
  console.error(`Current URL: ${page.url()}`);
  console.error(`Visible text:\n${visibleText.slice(0, 1000)}`);
  console.error("Slowest login requests:");
  console.error(JSON.stringify(loginRequests.slice(0, 8), null, 2));

  throw error;
}
await waitForSettledUi(page);
const loginEnd = performance.now();

const results = [];

for (let iteration = 1; iteration <= iterations; iteration += 1) {
  for (const step of navigationSteps) {
    results.push(await measureNavigationStep(page, step, iteration));
  }
}

await browser.close();

printSummary({
  loginMs: loginEnd - loginStart,
  results,
  iterations,
  loginUrl,
  dbLatency: dbLatencyToken ? await measureDbLatency(loginUrl) : null,
});

async function measureNavigationStep(page, step, iteration) {
  const start = performance.now();
  const startingUrl = page.url();
  const link = page.getByRole("link", { name: step.label }).first();

  await Promise.all([
    page.waitForURL((url) => url.pathname === step.pathname, {
      timeout: 30_000,
    }),
    link.click(),
  ]);

  const urlReached = performance.now();
  await page
    .locator("#contenido-principal")
    .waitFor({ state: "visible", timeout: 30_000 });
  const mainVisible = performance.now();
  await waitForSettledUi(page);
  const settled = performance.now();

  const relevantRequests = summarizeRequestsBetween(start, settled);

  return {
    iteration,
    label: step.label,
    from: new URL(startingUrl).pathname,
    to: step.pathname,
    urlMs: urlReached - start,
    mainMs: mainVisible - start,
    settledMs: settled - start,
    requestCount: relevantRequests.length,
    slowestRequests: relevantRequests.slice(0, 5),
  };
}

async function waitForSettledUi(page) {
  await page.waitForLoadState("domcontentloaded", { timeout: 30_000 });

  try {
    await page.waitForLoadState("networkidle", { timeout: 5_000 });
  } catch {
    // Long-lived browser requests should not make the measurement fail.
  }

  await page.waitForTimeout(150);
}

function summarizeRequestsBetween(start, end) {
  const starts = new Map();
  const finished = [];

  for (const event of networkEvents) {
    if (event.at < start || event.at > end) {
      continue;
    }

    const key = `${event.method} ${event.url}`;

    if (event.type === "request") {
      starts.set(key, event);
      continue;
    }

    const startEvent = starts.get(key);
    const durationMs = startEvent ? event.at - startEvent.at : null;

    finished.push({
      method: event.method,
      status: event.status ?? null,
      resourceType: event.resourceType,
      pathname: safePathname(event.url),
      durationMs,
    });
  }

  return finished
    .filter((event) => event.durationMs !== null)
    .sort((a, b) => b.durationMs - a.durationMs);
}

async function measureDbLatency(baseUrl) {
  const url = new URL("/internal/perf/db-latency?samples=30", baseUrl);
  const response = await fetch(url, {
    headers: {
      "x-en-escena-perf-token": dbLatencyToken,
    },
  });

  if (!response.ok) {
    return {
      error: `DB latency endpoint returned ${response.status}`,
    };
  }

  return response.json();
}

function printSummary({ loginMs, results, iterations, loginUrl, dbLatency }) {
  const grouped = Map.groupBy(results, (result) => result.label);

  console.log(`URL: ${loginUrl}`);
  console.log(`Iteraciones: ${iterations}`);
  console.log(`Login settled: ${formatMs(loginMs)}`);

  if (dbLatency) {
    console.log(
      `DB latency: ${dbLatency.error ?? JSON.stringify(dbLatency.summary)}`,
    );
  }

  console.log("");
  console.log(
    [
      "Destino",
      "p50 settled",
      "p95 settled",
      "p50 URL",
      "p50 requests",
      "Peor request observado",
    ].join(" | "),
  );
  console.log(["---", "---:", "---:", "---:", "---:", "---"].join(" | "));

  for (const [label, rows] of grouped) {
    const settled = rows.map((row) => row.settledMs);
    const url = rows.map((row) => row.urlMs);
    const requestCounts = rows.map((row) => row.requestCount);
    const slowest = rows
      .flatMap((row) => row.slowestRequests)
      .sort((a, b) => b.durationMs - a.durationMs)[0];

    console.log(
      [
        label,
        formatMs(percentile(settled, 0.5)),
        formatMs(percentile(settled, 0.95)),
        formatMs(percentile(url, 0.5)),
        Math.round(percentile(requestCounts, 0.5)).toString(),
        slowest
          ? `${formatMs(slowest.durationMs)} ${slowest.method} ${slowest.pathname}`
          : "sin requests",
      ].join(" | "),
    );
  }

  console.log("");
  console.log("Detalle por iteración:");
  for (const result of results) {
    console.log(
      [
        `#${result.iteration}`,
        result.from,
        "->",
        result.to,
        `url=${formatMs(result.urlMs)}`,
        `settled=${formatMs(result.settledMs)}`,
        `requests=${result.requestCount}`,
      ].join(" "),
    );
  }
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * p) - 1),
  );

  return sorted[index] ?? 0;
}

function formatMs(value) {
  return `${Math.round(value)}ms`;
}

function safePathname(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function readPositiveIntegerEnv(name, fallback) {
  const value = process.env[name];

  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

async function importPlaywright() {
  try {
    const localPlaywright = await import("playwright");

    return localPlaywright.chromium ? localPlaywright : localPlaywright.default;
  } catch {
    const npmRoot = execFileSync("npm", ["root", "-g"], {
      encoding: "utf8",
    }).trim();
    const globalPlaywrightPath = `${npmRoot}/@playwright/cli/node_modules/playwright/index.js`;

    const globalPlaywright = await import(
      pathToFileURL(globalPlaywrightPath).href
    );

    return globalPlaywright.chromium
      ? globalPlaywright
      : globalPlaywright.default;
  }
}
