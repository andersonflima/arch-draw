import { test, type Page } from "@playwright/test";

// ── CodeMirror-axis performance spike ───────────────────────────────────────
// Code-snippet nodes load FORCED-collapsed (ensureArchitectureNodesHaveCodeContent),
// and the CodeMirror engine is a lazy chunk mounted only on expand. So the heavy
// state is "user expanded E editors at once" (double-click expands, others stay
// open). This probe seeds K collapsed code nodes, expands E of them, and measures
// the mount cost + interaction fps with E live editors.
//
// Build first, then run:
//   npm run build --workspace @arch-draw/web
//   PERF_CODE="1,5,10,20" npm run e2e:perf --workspace @arch-draw/web

const NOW = "2026-01-01T00:00:00.000Z";
const SEED = 40; // collapsed code nodes available to expand
const CODE = [
  "export function handle(req: Request): Response {",
  "  const id = req.params.id;",
  "  if (!id) throw new BadRequest('missing id');",
  "  const row = repo.find(id);",
  "  if (!row) return notFound();",
  "  return ok(mapToDto(row));",
  "}"
].join("\n");

const buildCodeDoc = (count: number) => {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const nodes = Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    kind: "code-function",
    label: `fn ${i}`,
    position: { x: 120 + (i % cols) * 520, y: 120 + Math.floor(i / cols) * 420 },
    size: { width: 360, height: 240 },
    color: "#1e293b",
    properties: { codeContent: CODE, codeLanguage: "typescript" }
  }));
  return { version: 1, id: "smoke-doc", title: `Code ${count}`, description: "", mermaidSource: "", createdAt: NOW, updatedAt: NOW, nodes, edges: [] as unknown[] };
};

const stubAndLoad = async (page: Page, doc: ReturnType<typeof buildCodeDoc>): Promise<void> => {
  const summary = { id: doc.id, title: doc.title, description: "", createdAt: NOW, updatedAt: NOW, nodeCount: doc.nodes.length, edgeCount: 0 };
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.includes("/auth/session")) return json({ ok: true, authEnabled: false, authenticated: false, user: null });
    if (/\/architectures\/smoke-doc$/.test(url) && method === "GET") return json(doc);
    if (/\/architectures\/?$/.test(url) && method === "GET") return json([summary]);
    if (method === "PUT" || method === "POST") return json(doc);
    return json({});
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForSelector(".architecture-node", { timeout: 45000 });
};

// Expand E code nodes via double-click; returns ms to mount all E editors.
const expandEditors = async (page: Page, count: number): Promise<number> => {
  const t0 = Date.now();
  await page.evaluate((ids) => {
    for (const id of ids) {
      const el = document.querySelector(`[data-node-id="${id}"]`);
      el?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, view: window }));
    }
  }, Array.from({ length: count }, (_, i) => `n${i}`));
  await page.waitForFunction((n) => document.querySelectorAll(".cm-editor").length >= n, count, { timeout: 60000 });
  return Date.now() - t0;
};

const sampleGesture = async (page: Page, gesture: "pan" | "zoom", durationMs: number): Promise<number[]> =>
  page.evaluate(
    ({ gesture, durationMs }) => {
      const shell = document.querySelector(".canvas-shell") as HTMLElement | null;
      if (!shell) return [] as number[];
      const rect = shell.getBoundingClientRect();
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      return new Promise<number[]>((resolve) => {
        const frames: number[] = [];
        let last = performance.now();
        const start = last;
        let dir = 1;
        const tick = (now: number) => {
          frames.push(now - last);
          last = now;
          if (gesture === "pan") shell.dispatchEvent(new WheelEvent("wheel", { deltaX: 14 * dir, deltaY: 8, bubbles: true, cancelable: true }));
          else shell.dispatchEvent(new WheelEvent("wheel", { deltaY: -40 * dir, ctrlKey: true, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
          if ((now - start) % 600 < 16) dir *= -1;
          if (now - start < durationMs) requestAnimationFrame(tick);
          else resolve(frames);
        };
        requestAnimationFrame(tick);
      });
    },
    { gesture, durationMs }
  );

const stats = (frames: number[]) => {
  const usable = frames.slice(1).filter((d) => d > 0 && d < 2000);
  if (usable.length === 0) return { p95: 0, fps: 0 };
  const sorted = [...usable].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  return { p95: +p95.toFixed(2), fps: +(1000 / median).toFixed(1) };
};

const COUNTS = (process.env.PERF_CODE ?? "1,5,10,20").split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
const results: Array<Record<string, unknown>> = [];

for (const count of COUNTS) {
  test(`code perf @ ${count} editors`, async ({ page }) => {
    test.setTimeout(150000);
    await stubAndLoad(page, buildCodeDoc(SEED));
    const mountMs = await expandEditors(page, count);
    const liveEditors = await page.locator(".cm-editor").count();

    await page.waitForTimeout(300);
    const pan = stats(await sampleGesture(page, "pan", 2000));
    await page.waitForTimeout(150);
    const zoom = stats(await sampleGesture(page, "zoom", 2000));

    const row = { editors: count, liveEditors, mountMs, panFps: pan.fps, panP95Ms: pan.p95, zoomFps: zoom.fps, zoomP95Ms: zoom.p95 };
    results.push(row);
    // eslint-disable-next-line no-console
    console.log(`CODE_ROW ${JSON.stringify(row)}`);
  });
}

test.afterAll(() => {
  // eslint-disable-next-line no-console
  console.log("\nCODE_SUMMARY " + JSON.stringify(results));
});
