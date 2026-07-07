import { test, expect, type Page } from "@playwright/test";

// On a blank canvas (no document yet) clicking a palette block must start a
// document and place the node — it used to be discarded because the shell only
// synced to editor2 when a document already existed. The minimap only shows once
// there is content to map.

const stub = async (page: Page): Promise<void> => {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const json = (b: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (url.includes("/auth/session")) return json({ ok: true, authEnabled: false, authenticated: false, user: null });
    if (/\/architectures\/?$/.test(url) && method === "GET") return json([]); // no saved diagrams
    // upsert save of the freshly-started document
    if (method === "PUT" || method === "POST") {
      const body = route.request().postDataJSON?.() ?? {};
      return json({ ...body, id: body.id ?? "new-doc" });
    }
    return json({});
  });
};

test("clicking a palette block on a blank canvas creates the node", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await stub(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForTimeout(700);

  // blank canvas: no nodes, no minimap
  await expect(page.locator("app-editor2 [data-e2-id]")).toHaveCount(0);
  await expect(page.locator("app-editor2 f-minimap")).toHaveCount(0);

  await page.locator(".palette-item").first().click();
  await page.waitForTimeout(700);

  // the node is now on the canvas and the minimap appears
  const count = await page.locator("app-editor2 [data-e2-id]").count();
  expect(count).toBeGreaterThan(0);
  await expect(page.locator("app-editor2 f-minimap")).toHaveCount(1);
});
