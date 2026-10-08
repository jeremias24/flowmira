// Extra connection points on shapes, in real headless Chrome against a fake API.
// Same setup as image-shape.check.mjs.
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://127.0.0.1:4173";
const TEMPLATES = process.env.TEMPLATES ?? "templates";
const SHOTS = process.env.SHOTS ?? ".";

let fail = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) fail++; };
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;
const tpl = (key) => JSON.parse(readFileSync(`${TEMPLATES}/${key}.json`, "utf8"));
const now = "2026-10-30T00:00:00Z";
const diagram = (id, title, template_key, data) =>
  ({ id, title, template_key, updated_at: now, created_at: now, owner_name: "T", data });
const item = (id, shape, x, y, extra = {}) => ({ id, x, y, shape, label: id, fields: {}, ...extra });

const db = new Map([
  [1, diagram(1, "Links A", "flowchart", {
    items: [item("a", "process", 0, 0, { w: 160, h: 80 }), item("b", "process", 400, 200, { w: 160, h: 80 })],
    edges: [
      { id: "old", source: "a", target: "b", sourceHandle: "r", targetHandle: "l" },
      { id: "new", source: "a", target: "b", sourceHandle: "b75", targetHandle: "t25" },
    ],
  })],
  [2, diagram(2, "Outlines B", "flowchart", {
    edges: [],
    items: [
      item("dia", "decision", 0, 0, { w: 200, h: 100 }), item("cir", "circle", 300, 0, { w: 100, h: 100 }),
      item("ter", "terminator", 500, 0, { w: 160, h: 60 }), item("evt", "event-start", 0, 200),
      item("big", "event-start", 200, 200, { fontSize: 36 }), item("cld", "cloud", 400, 200, { w: 200, h: 100 }),
      item("act", "actor", 700, 200), item("per", "persona", 0, 400), item("img", "text", 400, 400),
    ],
  })],
  [3, diagram(3, "Swap C", "flowchart", {
    items: [item("s", "process", 0, 0, { w: 200, h: 100 }), item("t", "process", 0, 300, { w: 200, h: 100 })],
    edges: [{ id: "x", source: "s", target: "t", sourceHandle: "l25", targetHandle: "t" }],
  })],
]);

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(String(e)));
page.on("console", (m) => { if (["error", "warning"].includes(m.type()) && !m.text().startsWith("Failed to load resource")) problems.push(m.text()); });
page.on("response", (r) => { if (r.status() >= 400 && !r.url().includes("/api/erd/")) problems.push(`${r.status()} ${r.url()}`); });

await page.route("**/*", async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  if (url.host !== new URL(BASE).host) return route.abort();
  if (!url.pathname.startsWith("/api/")) return route.continue();
  const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const p = url.pathname;
  if (p === "/api/auth/me") return json({ id: "1", full_name: "Tester", email: null, user_type: "System Owner", role: "owner" });
  if (p === "/api/templates") return json([{ key: "flowchart", name: tpl("flowchart").name, version: 1 }]);
  if (p.startsWith("/api/templates/")) return json({ key: "flowchart", name: tpl("flowchart").name, version: 1, definition: tpl("flowchart") });
  if (p === "/api/diagrams") return json([...db.values()].map(({ data, ...s }) => s));
  const d = db.get(Number(p.split("/").pop()));
  if (!d) return json({ detail: "not found" }, 404);
  if (req.method() === "PUT") Object.assign(d, req.postDataJSON());
  return json(d);
});

const open = async (title) => {
  await page.goto(BASE);
  await page.getByText(title, { exact: true }).click();
  await page.locator(".react-flow__pane").waitFor();
  await page.waitForTimeout(500);
};
const node = (id) => page.locator(`.react-flow__node[data-id="${id}"]`);
const dot = (n, h) => node(n).locator(`[data-handleid="${h}"]`);
const scale = () => page.locator(".react-flow__viewport").evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
/** Dot centre as % of the shape box, undoing the canvas zoom. */
const dotPct = async (n, h) => {
  const b = await node(n).boundingBox();
  const d = await dot(n, h).boundingBox();
  return { x: ((d.x + d.width / 2 - b.x) / b.width) * 100, y: ((d.y + d.height / 2 - b.y) / b.height) * 100 };
};
const hover = async (n) => { await node(n).hover(); await page.waitForTimeout(200); };
const pathOf = (id) => page.locator(`.react-flow__edge[data-id="${id}"] path.react-flow__edge-path`).getAttribute("d");
const start = (d) => d.match(/^M\s*([-\d.]+)[ ,]([-\d.]+)/).slice(1).map(Number);
const end = (d) => d.match(/([-\d.]+)[ ,]([-\d.]+)\s*$/).slice(1).map(Number);

// ---------- loading and drawing ----------
await open("Links A");
ok(await node("a").locator(".react-flow__handle").count() === 12, "a shape has 12 connection points");
ok(await page.locator(".react-flow__edge").count() === 2, "old (r -> l) and new (b75 -> t25) arrows both load");
const oldPath = await pathOf("old");
ok(near(start(oldPath)[1], 40) && near(start(oldPath)[0], 166, 7), `existing arrow still leaves the middle of the right side (${start(oldPath)})`);
const newPath = await pathOf("new");
ok(near(start(newPath)[0], 120) && near(end(newPath)[0], 440), `saved extra point draws at 75% / 25% (${start(newPath)} -> ${end(newPath)})`);
await hover("a");
await page.screenshot({ path: `${SHOTS}/connection-hover.png` });

await node("a").hover();
const from = await dot("a", "t25").boundingBox();
await hover("b");
const to = await dot("b", "b75").boundingBox();
await hover("a");
await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
await page.mouse.down();
await page.mouse.move(to.x, to.y + 30, { steps: 8 });
await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 4 });
await page.mouse.up();
await page.waitForTimeout(300);
ok(await page.locator(".react-flow__edge").count() === 3, "dragging between two extra points draws an arrow");
await page.keyboard.press("Control+s");
await page.waitForTimeout(400);
const saved = db.get(1).data.edges.find((e) => !["old", "new"].includes(e.id));
ok(saved?.sourceHandle === "t25" && saved?.targetHandle === "b75", `the arrow saves its exact points (${saved?.sourceHandle} -> ${saved?.targetHandle})`);

// ---------- Details panel ----------
// Click the line itself, just below where it leaves shape a.
const a = await node("a").boundingBox();
await page.mouse.click(a.x + a.width * 0.75, a.y + a.height + 30);
await page.waitForTimeout(300);
const leaves = page.locator('label:has(> span:text-is("Leaves from")) select');
ok(await leaves.locator("option").count() === 12, "Details panel lists all 12 points");
ok(await leaves.inputValue() === "b75", "Details panel shows the current point");
await leaves.selectOption("t25");
await page.waitForTimeout(200);
ok(near(start(await pathOf("new"))[0], 40), "choosing a point in Details moves the arrow");

// ---------- dots sit on the outline ----------
await open("Outlines B");
const at = async (n, h) => { await hover(n); return dotPct(n, h); };
let p = await at("dia", "t25");
ok(near(p.x, 25) && near(p.y, 25), `diamond: dot on the slanted edge (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
p = await at("cir", "t25");
ok(near(p.x, 25, 2) && near(p.y, 6.7, 2), `circle: dot on the curve (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
p = await at("cir", "r75");
ok(near(p.x, 93.3, 2) && near(p.y, 75, 2), `circle: right side (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
p = await at("ter", "l25");
const w = (await node("ter").boundingBox()).width / (await scale());
ok(near((p.x / 100) * w, 4, 2), `pill: dot on the round end (${((p.x / 100) * w).toFixed(1)}px in)`);
for (const n of ["evt", "big"]) {
  await hover(n);
  const d = await dot(n, "t25").boundingBox();
  const sym = await node(n).locator(".shape__symbol").boundingBox();
  const r = (Math.min(sym.width, sym.height) * 46) / 100; // the outline's radius in the 0-100 box
  const dist = Math.hypot(d.x + d.width / 2 - (sym.x + sym.width / 2), d.y + d.height / 2 - (sym.y + sym.height / 2));
  ok(near(dist, r, 1.5), `${n}: dot on the circle, not the caption (${dist.toFixed(1)} vs r ${r.toFixed(1)})`);
}
// A card has a 4px left border: its right-side dots must stay level with the middle one.
await hover("per");
const mid = await dot("per", "r").boundingBox();
const low = await dot("per", "r25").boundingBox();
ok(near(mid.x, low.x, 0.5), `far-side dots line up with the middle dot (${mid.x} vs ${low.x})`);
p = await at("cld", "t25");
ok(p.y > 15, `cloud: dot on the cloud, not the box (${p.y.toFixed(1)}%)`);
await hover("act");
ok(await dot("act", "l75").isVisible(), "actor: has its extra points");
await hover("cld");
await page.screenshot({ path: `${SHOTS}/connection-outlines.png` });

// ---------- dots follow changes ----------
await open("Swap C");
const before = start(await pathOf("x"));
await node("s").click();
await page.locator('label:has(> span:text-is("Shape")) select, select:has(option[value="decision"])').first().selectOption("decision");
await page.waitForTimeout(500);
const after = start(await pathOf("x"));
ok(after[0] > before[0] + 30, `changing the shape moves the attached arrow onto the new outline (${before} -> ${after})`);
ok(await page.locator(".react-flow__edge").count() === 1, "the arrow survives the shape change");

ok(problems.length === 0, `no page errors or warnings ${problems.slice(0, 3).join(" | ")}`);
await browser.close();
console.log(fail ? `${fail} FAILED` : "ALL PASSED");
process.exit(fail ? 1 : 0);
