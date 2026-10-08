// Fishbone template + foldable Flowchart toolbox, in real headless Chrome against a fake API.
// Same setup as refresh.check.mjs. TEMPLATES = folder with flowchart.json and fishbone.json.
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://127.0.0.1:4173/flowmira/";
const TEMPLATES = process.env.TEMPLATES ?? "templates";
const SHOTS = process.env.SHOTS ?? ".";
let fail = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) fail++; };
const tpl = (key) => JSON.parse(readFileSync(`${TEMPLATES}/${key}.json`, "utf8"));
const now = "2026-11-10T00:00:00Z";
const db = new Map([
  [1, { id: 1, ref: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1", title: "Flow A", template_key: "flowchart", updated_at: now, created_at: now, owner_name: "T", data: { items: [], edges: [] } }],
  [2, { id: 2, ref: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA2", title: "Late deliveries", template_key: "fishbone", updated_at: now, created_at: now, owner_name: "T", data: { items: [], edges: [] } }],
]);
let lastPut = null;

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.route("**/api/**", async (route) => {
  const req = route.request(); const p = new URL(req.url()).pathname;
  const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (p === "/api/auth/me") return json({ id: "1", full_name: "Tester", email: null, user_type: "System Owner", role: "owner" });
  if (p === "/api/templates") return json(["flowchart", "fishbone"].map((key) => ({ key, name: tpl(key).name, version: 1, accent: tpl(key).accent })));
  if (p.startsWith("/api/templates/")) { const key = p.split("/").pop(); return json({ key, name: tpl(key).name, version: 1, definition: tpl(key) }); }
  if (p === "/api/diagrams") return json([...db.values()].map(({ data, ...s }) => s));
  if (p.startsWith("/api/diagrams/by-ref/")) {
    const hit = [...db.values()].find((x) => x.ref === p.split("/").pop());
    return hit ? json(hit) : json({ detail: "Diagram not found" }, 404);
  }
  const d = db.get(Number(p.split("/").pop()));
  if (!d) return json({ detail: "not found" }, 404);
  if (req.method() === "PUT" || req.method() === "PATCH") { lastPut = JSON.parse(req.postData() ?? "{}"); Object.assign(d, lastPut); return json(d); }
  return json(d);
});

// ---------------- Flowchart toolbox ----------------
await page.goto(`${BASE}diagram/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1`);
const tiles = page.locator('[aria-label="Toolbox"] h3 + div button'); // shape tiles under a category heading
await tiles.first().waitFor();
const expected = tpl("flowchart").palette.length;
ok(await tiles.count() === expected, `Flowchart toolbox shows every shape (${await tiles.count()} of ${expected})`);
const heads = page.locator('[aria-label="Toolbox"] h3 button[aria-expanded]');
ok(await heads.count() === 5, `5 foldable categories (${await heads.count()})`);
const software = page.getByRole("button", { name: /^Software/ });
await software.click();
ok(await software.getAttribute("aria-expanded") === "false", "clicking Software folds it");
ok(await page.getByRole("button", { name: /^Software.*13 hidden/ }).count() === 1, "folded heading says 13 hidden");
ok(await tiles.count() === expected - 13, "Software shapes are hidden");
ok(await page.locator('[aria-label="Toolbox"] button[title^="Server:"]').count() === 0, "Server tile gone while folded");
await page.reload();
await tiles.first().waitFor();
ok(await page.getByRole("button", { name: /^Software/ }).getAttribute("aria-expanded") === "false", "fold is remembered after a refresh");
await page.getByRole("button", { name: /^Software/ }).click();
ok(await tiles.count() === expected, "clicking again shows them again");

// ---------------- Fishbone ----------------
await page.goto(`${BASE}diagram/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA2`);
const zone = (id) => page.locator(`.react-flow__node-zone[data-id="${id}"]`);
await zone("people").waitFor();
ok(await page.locator(".react-flow__node-zone").count() === 6, "6 bones");
const head = page.locator('.react-flow__node[data-id="fishbone-head"]');
ok(await head.count() === 1, "head (problem box) is there");
ok((await head.innerText()).includes("Problem (effect)"), "head says Problem (effect)");
ok(await page.getByText("Unsaved changes").count() === 0, "opening a new fishbone doesn't mark it unsaved");
ok(await page.locator(".zone__spine").count() === 3, "spine drawn by the 3 top bones");

const causes = (zoneId) => page.locator(`.react-flow__node-item[data-id]`).filter({ has: page.locator("*") }).evaluateAll(
  (els, z) => els.map((e) => ({ id: e.dataset.id, r: e.getBoundingClientRect() }))
    .filter((x) => x.id !== "fishbone-head"), zoneId);
const box = async (loc) => loc.boundingBox();
const flowPos = (loc) => loc.evaluate((e) => e.style.transform);
const itemPositions = () => page.locator(".react-flow__node-item").evaluateAll(
  (els) => els.map((e) => `${e.dataset.id}=${e.style.transform}`).sort().join(" "));
const clickEmptyCanvas = async () => {
  const c = await box(page.locator(".react-flow__pane"));
  await page.mouse.click(c.x + 40, c.y + 40); // top-left corner of the canvas: nothing there
};
const add = async (zoneId, n = 1) => {
  for (let i = 0; i < n; i++) {
    await zone(zoneId).getByRole("button", { name: /^Add cause to/ }).click();
    await page.waitForTimeout(80);
  }
};
const inZone = async (zoneId) => {
  const z = await box(zone(zoneId));
  const all = await causes();
  return all.filter((c) => c.r.x + c.r.width / 2 >= z.x && c.r.x + c.r.width / 2 <= z.x + z.width
    && c.r.y + c.r.height / 2 >= z.y && c.r.y + c.r.height / 2 <= z.y + z.height).map((c) => c.r);
};

await add("people", 3);
let pz = await box(zone("people"));
let pc = await inZone("people");
ok(pc.length === 3, `3 causes on People (${pc.length})`);
ok(pc.every((r, i) => i === 0 || (r.y > pc[i - 1].y && r.x > pc[i - 1].x)), "top-bone causes step down and right along the slant");
// bone line: (start, band) -> (W, H), zone-local; scale from the zone's on-screen width
const scale = pz.width / 340;
const start = (12 + 170 + 10), band = 44;
const boneX = (zb, yScreen) => {
  const H = zb.height / scale;
  const y = (yScreen - zb.y) / scale;
  return zb.x + (start + (y - band) * (340 - start) / (H - band)) * scale;
};
ok(pc.every((r) => r.x + r.width <= boneX(pz, r.y + r.height / 2) + 1), "each cause ends left of the bone");
ok(pc.every((r) => boneX(pz, r.y + r.height / 2) - (r.x + r.width) < 14 * scale), "and sits right next to it");

await add("method", 2);
const mz = await box(zone("method"));
const mc = await inZone("method");
ok(mc.length === 2 && mc.every((r) => r.y > pz.y + pz.height - 2), "bottom-bone causes are below the spine");
ok(mc[1].x < mc[0].x, "bottom-bone causes step down and left along the slant");

// More causes than fit: every bone grows to the same height, head stays on the spine.
const h0 = pz.height;
await add("people", 6);
pz = await box(zone("people"));
ok(pz.height > h0 + 10, `bones grow to fit (${Math.round(h0)} -> ${Math.round(pz.height)})`);
ok(Math.abs((await box(zone("machine"))).height - pz.height) < 1, "all bones share the height");
const hb = await box(head);
ok(Math.abs(hb.y + hb.height / 2 - (pz.y + pz.height)) < 3, "head stays centred on the spine");
ok(Math.abs((await box(zone("method"))).y - (pz.y + pz.height)) < 2, "bottom bones start at the spine");

// Drag a cause from People onto Machine.
pc = await inZone("people");
const first = pc[0];
const mach = await box(zone("machine"));
await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
await page.mouse.down();
await page.mouse.move(mach.x + 80, mach.y + 90, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(200);
ok((await inZone("people")).length === 8, "dragged cause left People");
const mcs = await inZone("machine");
ok(mcs.length === 1, "and landed on Machine");
const mz2 = await box(zone("machine"));
ok(mcs.every((r) => r.x + r.width <= boneX(mz2, r.y + r.height / 2) + 1), "lined up on Machine's bone");

// Delete a cause: the rest close up.
pc = await inZone("people");
const before = pc.map((r) => r.y);
await page.mouse.click(pc[0].x + pc[0].width / 2, pc[0].y + pc[0].height / 2);
await page.keyboard.press("Delete");
await page.waitForTimeout(200);
pc = await inZone("people");
ok(pc.length === 7, "deleted one cause");
ok(Math.abs(pc[0].y - before[0]) < 2, "the rest moved up to close the gap");

// Head can't be dragged or deleted. (Dragging it pans the canvas, so compare diagram positions.)
const hp1 = await flowPos(head);
const hb1 = await box(head);
await page.mouse.move(hb1.x + 20, hb1.y + 20); await page.mouse.down();
await page.mouse.move(hb1.x + 220, hb1.y + 220, { steps: 8 }); await page.mouse.up();
ok(await flowPos(head) === hp1, `head doesn't move when dragged (${hp1})`);
const hb2 = await box(head);
await page.mouse.click(hb2.x + 20, hb2.y + 20);
await page.keyboard.press("Delete");
await page.waitForTimeout(150);
ok(await head.count() === 1, "head can't be deleted");
// Rename the head.
await head.dblclick();
await page.keyboard.press("Control+a");
await page.keyboard.type("Late deliveries to dealers");
await clickEmptyCanvas();
ok((await head.innerText()).includes("Late deliveries to dealers"), "head text can be edited");

// Details panel: bones are editable (called "Bones").
await clickEmptyCanvas();
ok(await page.getByRole("heading", { name: "Bones" }).count() === 1, "Details panel lists the bones");
ok(await page.getByRole("button", { name: "Add bone" }).count() === 1, "with Add bone");
ok(await page.getByText("Column height").count() === 0, "no column size panel");
await page.screenshot({ path: `${SHOTS}/fishbone.png` });

// Save and reopen: same layout.
await page.keyboard.press("Control+s");
await page.getByText("Unsaved changes").waitFor({ state: "detached" }).catch(() => {});
ok(lastPut?.data?.items?.some((i) => i.id === "fishbone-head" && i.label === "Late deliveries to dealers"), "saved with the head");
ok(lastPut?.data?.items?.filter((i) => i.zone === "people").length === 7, "saved 7 People causes");
const savedPeople = await itemPositions();
await page.reload();
await zone("people").waitFor();
await page.waitForTimeout(300);
const reopened = await itemPositions();
ok(savedPeople === reopened, "reopened with every cause and the head in the same places");
ok(await page.getByText("Unsaved changes").count() === 0, "reopening doesn't mark it unsaved");

// Add a 7th bone in the Details panel: it goes on top, after the last pair; head moves right.
const hx = Number(/translate\(([-\d.]+)px/.exec(await flowPos(head))[1]);
await page.getByRole("button", { name: "Add bone" }).click();
await page.waitForTimeout(200);
ok(await page.locator(".react-flow__node-zone").count() === 7, "7 bones after Add bone");
const hx2 = Number(/translate\(([-\d.]+)px/.exec(await flowPos(head))[1]);
ok(hx2 === hx + 340, `head moved one bone width along the longer spine (${hx} -> ${hx2})`);
await page.screenshot({ path: `${SHOTS}/fishbone-7.png` });

ok(errors.length === 0, `no page errors ${errors.join(" | ")}`);
await browser.close();
console.log(fail ? `${fail} FAILED` : "ALL PASSED");
process.exit(fail ? 1 : 0);
