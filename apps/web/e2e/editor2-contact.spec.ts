import { test, expect, type Page } from "@playwright/test";

// Regression guard: the drag "contact area" in the greenfield editor (?editor=v2)
// — while a node is moved its anchors and the lines linking the moved elements are
// hidden to keep the view readable, and everything returns on drop.
const NOW = "2026-01-01T00:00:00.000Z";
const DOC = { version:2, id:"verify-doc", title:"Verify", description:"", mermaidSource:"", createdAt:NOW, updatedAt:NOW,
  nodes:[
    {id:"n1",kind:"service",label:"n1",position:{x:300,y:260},size:{width:150,height:90},color:"#fff"},
    {id:"n2",kind:"database",label:"n2",position:{x:700,y:260},size:{width:150,height:90},color:"#fff"}],
  edges:[{id:"e1",from:"n1",to:"n2"}] };
const stub = async (page: Page) => { await page.route("**/api/**", async r=>{const u=r.request().url();const m=r.request().method();const j=(b:unknown)=>r.fulfill({status:200,contentType:"application/json",body:JSON.stringify(b)});
  if(u.includes("/auth/session"))return j({ok:true,authEnabled:false,authenticated:false,user:null});
  if(/architectures\/verify-doc$/.test(u)&&m==="GET")return j(DOC);
  if(/architectures\/?$/.test(u)&&m==="GET")return j([{id:"verify-doc",title:"Verify",description:"",createdAt:NOW,updatedAt:NOW,nodeCount:2,edgeCount:1}]);
  return j({});});};
const connOpacity = (page: Page) => page.locator('[data-e2-id="n1"] .e2-conn--out').evaluate(el => getComputedStyle(el as HTMLElement).opacity);
const edgeMuted = (page: Page) => page.locator("app-editor2 f-connection").first().evaluate(el => el.classList.contains("e2-edge--muted"));

test("drag hides anchors + mutes the moved node's line; drop restores them", async ({ page }) => {
  await stub(page);
  await page.goto("/?editor=v2", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-e2-id="n1"]', { timeout: 10000 });
  await page.waitForTimeout(300);

  expect(await connOpacity(page)).toBe("1");
  expect(await edgeMuted(page)).toBe(false);

  const b = (await page.locator('[data-e2-id="n1"]').boundingBox())!;
  const cx = b.x + b.width/2, cy = b.y + b.height/2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 10, cy + 8);
  await page.mouse.move(cx + 90, cy + 60, { steps: 8 });
  await page.waitForTimeout(120);
  const dragging = await page.locator("app-editor2 .e2-flow--dragging").count();
  const midConn = await connOpacity(page);
  const midMuted = await edgeMuted(page);
  expect(dragging).toBe(1);
  expect(midConn).toBe("0");
  expect(midMuted).toBe(true);

  await page.mouse.up();
  await page.waitForTimeout(150);
  expect(await connOpacity(page)).toBe("1");
  expect(await edgeMuted(page)).toBe(false);
});
