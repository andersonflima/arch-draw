import { test, expect, type Page } from "@playwright/test";

// ── Canvas performance spike ────────────────────────────────────────────────
// Measures the EXISTING rendering pipeline (HTML-overlay nodes + SVG edges +
// spatial-index culling + transform-based camera) under load, so we have real
// numbers before deciding whether the render strategy is worth touching.
//
// It boots the production build with a stubbed API that returns a synthetic
// architecture of N nodes laid out on a grid, then drives pan / zoom / drag
// gestures from inside the page (rAF loop) while sampling frame deltas. Working
// in-page avoids Playwright round-trip latency dominating the measurement.
//
// Build first, then run:
//   npm run build --workspace @arch-draw/web
//   PERF_NODES="50,200,800,1500,3000" npm run e2e:perf --workspace @arch-draw/web

const NOW = "2026-01-01T00:00:00.000Z";
const NODE_W = 160;
const NODE_H = 96;
const COL_GAP = 240;
const ROW_GAP = 180;
const LEAF_KINDS = ["service", "database", "queue", "gateway", "cache"] as const;

type SyntheticDoc = ReturnType<typeof buildSyntheticDoc>;

const buildSyntheticDoc = (nodeCount: number) => {
  const cols = Math.max(1, Math.ceil(Math.sqrt(nodeCount)));
  const nodes = Array.from({ length: nodeCount }, (_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      id: `n${i}`,
      kind: LEAF_KINDS[i % LEAF_KINDS.length],
      label: `Node ${i}`,
      position: { x: 160 + col * COL_GAP, y: 160 + row * ROW_GAP },
      size: { width: NODE_W, height: NODE_H },
      color: "#3b82f6"
    };
  });
  // A connected chain plus a few cross-links, so edge routing has real work.
  const edges = [
    ...nodes.slice(1).map((n, i) => ({ id: `e${i}`, from: `n${i}`, to: n.id })),
    ...Array.from({ length: Math.floor(nodeCount / 8) }, (_, i) => ({
      id: `x${i}`,
      from: `n${i * 4}`,
      to: `n${Math.min(nodeCount - 1, i * 4 + cols)}`
    }))
  ];
  return {
    version: 1,
    id: "smoke-doc",
    title: `Perf ${nodeCount}`,
    description: "",
    mermaidSource: "",
    createdAt: NOW,
    updatedAt: NOW,
    nodes,
    edges
  };
};

const stubAndLoad = async (page: Page, doc: SyntheticDoc): Promise<void> => {
  const summary = {
    id: doc.id,
    title: doc.title,
    description: "",
    createdAt: NOW,
    updatedAt: NOW,
    nodeCount: doc.nodes.length,
    edgeCount: doc.edges.length
  };
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.includes("/auth/session")) return json({ ok: true, authEnabled: false, authenticated: false, user: null });
    if (/\/architectures\/smoke-doc$/.test(url) && method === "GET") return json(doc);
    if (/\/architectures\/?$/.test(url) && method === "GET") return json([summary]);
    if (method === "PUT" || method === "POST") return json(doc);
    return json({});
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForSelector(".architecture-node", { timeout: 45000 });
};

// Drives a gesture in-page via a rAF loop and returns per-frame deltas (ms).
const sampleGesture = async (
  page: Page,
  gesture: "pan" | "zoom" | "drag",
  durationMs: number
): Promise<number[]> =>
  page.evaluate(
    ({ gesture, durationMs }) => {
      const shell = document.querySelector(".canvas-shell") as HTMLElement | null;
      if (!shell) return [];
      const rect = shell.getBoundingClientRect();
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      const node = document.querySelector(".architecture-node") as HTMLElement | null;
      const nodeRect = node?.getBoundingClientRect();
      let nx = (nodeRect?.x ?? cx) + 10;
      let ny = (nodeRect?.y ?? cy) + 10;

      if (gesture === "drag" && node) {
        node.dispatchEvent(new PointerEvent("pointerdown", { clientX: nx, clientY: ny, bubbles: true, cancelable: true, pointerId: 1, button: 0 }));
      }

      return new Promise<number[]>((resolve) => {
        const frames: number[] = [];
        let last = performance.now();
        const start = last;
        let dir = 1;
        const tick = (now: number) => {
          frames.push(now - last);
          last = now;
          if (gesture === "pan") {
            shell.dispatchEvent(new WheelEvent("wheel", { deltaX: 14 * dir, deltaY: 8, bubbles: true, cancelable: true }));
            if ((now - start) % 600 < 16) dir *= -1;
          } else if (gesture === "zoom") {
            shell.dispatchEvent(new WheelEvent("wheel", { deltaY: -40 * dir, ctrlKey: true, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
            if ((now - start) % 500 < 16) dir *= -1;
          } else if (gesture === "drag") {
            nx += 6 * dir;
            ny += 3;
            window.dispatchEvent(new PointerEvent("pointermove", { clientX: nx, clientY: ny, bubbles: true, cancelable: true, pointerId: 1 }));
            if ((now - start) % 700 < 16) dir *= -1;
          }
          if (now - start < durationMs) requestAnimationFrame(tick);
          else {
            if (gesture === "drag") window.dispatchEvent(new PointerEvent("pointerup", { clientX: nx, clientY: ny, bubbles: true, cancelable: true, pointerId: 1, button: 0 }));
            resolve(frames);
          }
        };
        requestAnimationFrame(tick);
      });
    },
    { gesture, durationMs }
  );

const stats = (frames: number[]) => {
  const usable = frames.slice(1).filter((d) => d > 0 && d < 1000);
  if (usable.length === 0) return { median: 0, p95: 0, fps: 0, samples: 0 };
  const sorted = [...usable].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  return { median: +median.toFixed(2), p95: +p95.toFixed(2), fps: +(1000 / median).toFixed(1), samples: usable.length };
};

const COUNTS = (process.env.PERF_NODES ?? "50,200,800")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);

const results: Array<Record<string, unknown>> = [];

for (const count of COUNTS) {
  test(`perf @ ${count} nodes`, async ({ page }) => {
    test.setTimeout(120000);
    const doc = buildSyntheticDoc(count);

    const t0 = Date.now();
    await stubAndLoad(page, doc);
    await page.waitForFunction(() => document.querySelectorAll(".architecture-node").length > 0, { timeout: 45000 });
    const initialRenderMs = Date.now() - t0;

    const domNodes = await page.locator(".architecture-node").count();
    const domEdges = await page.locator(".canvas-edge").count();

    await page.waitForTimeout(250);
    const pan = stats(await sampleGesture(page, "pan", 2200));
    await page.waitForTimeout(150);
    const zoom = stats(await sampleGesture(page, "zoom", 2200));
    await page.waitForTimeout(150);
    const drag = stats(await sampleGesture(page, "drag", 2200));

    const row = {
      nodes: count,
      edges: doc.edges.length,
      initialRenderMs,
      domNodes,
      domEdges,
      panFps: pan.fps,
      panP95Ms: pan.p95,
      zoomFps: zoom.fps,
      zoomP95Ms: zoom.p95,
      dragFps: drag.fps,
      dragP95Ms: drag.p95
    };
    results.push(row);
    // eslint-disable-next-line no-console
    console.log(`PERF_ROW ${JSON.stringify(row)}`);
    expect(domNodes).toBeGreaterThan(0);
  });
}

test.afterAll(() => {
  // eslint-disable-next-line no-console
  console.log("\nPERF_SUMMARY " + JSON.stringify(results));
});
