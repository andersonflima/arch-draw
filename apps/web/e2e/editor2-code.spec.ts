import { test, expect, type Page } from "@playwright/test";

// Regression guard: per-node example code snippet (CodeMirror 6) in the greenfield
// editor (?editor=v2) — toggling reveals the editor seeded from the document, the
// node grows to fit it, and edits flow back into editor state.

const NOW = "2026-01-01T00:00:00.000Z";
const DOC = {
  version: 2, id: "verify-doc", title: "Verify", description: "", mermaidSource: "",
  createdAt: NOW, updatedAt: NOW,
  nodes: [
    { id: "n3", kind: "service", label: "svc", position: { x: 500, y: 260 }, size: { width: 150, height: 90 }, color: "#fff",
      properties: { codeContent: "export const hi = () => 42;", codeLanguage: "typescript" } }
  ],
  edges: []
};
const SUMMARY = { id: "verify-doc", title: "Verify", description: "", createdAt: NOW, updatedAt: NOW, nodeCount: 1, edgeCount: 0 };
const stub = async (page: Page) => { await page.route("**/api/**", async r=>{const u=r.request().url();const m=r.request().method();const j=(b:unknown)=>r.fulfill({status:200,contentType:"application/json",body:JSON.stringify(b)});
  if(u.includes("/auth/session"))return j({ok:true,authEnabled:false,authenticated:false,user:null});
  if(/architectures\/verify-doc$/.test(u)&&m==="GET")return j(DOC);
  if(/architectures\/?$/.test(u)&&m==="GET")return j([SUMMARY]);
  return j({});});};

test("code node: toggle reveals CodeMirror with content; typing updates it", async ({ page }) => {
  await stub(page);
  await page.goto("/?editor=v2", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-e2-id="n3"]', { timeout: 10000 });
  await page.waitForTimeout(300);

  const node = page.locator('[data-e2-id="n3"]');
  await expect(node.locator(".e2-node__code-toggle")).toHaveCount(1);
  await node.locator(".e2-node__code-toggle").click();

  // CodeMirror loads async
  await page.waitForSelector('[data-e2-id="n3"] .cm-editor', { timeout: 10000 });
  const shown = await node.locator(".cm-content").innerText();
  expect(shown).toContain("export const hi");

  // node grew
  const h = (await node.boundingBox())!.height;
  expect(h).toBeGreaterThan(200);

  // type into it
  await node.locator(".cm-line").last().click();
  await page.waitForTimeout(50);
  await page.keyboard.insertText(" // note");
  await page.waitForTimeout(200);
  const after = await node.locator(".cm-content").innerText();
  expect(after).toContain("// note");
});
