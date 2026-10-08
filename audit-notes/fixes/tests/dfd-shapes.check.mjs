// DFD template and shapes, in real headless Chrome against a fake API. Same setup as font-text.check.mjs.
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://127.0.0.1:4173";
const TEMPLATES = process.env.TEMPLATES ?? "templates";
const SHOTS = process.env.SHOTS ?? ".";

let fail = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) fail++; };
const tpl = (key) => JSON.parse(readFileSync(`${TEMPLATES}/${key}.json`, "utf8"));
const now = "2026-11-10T00:00:00Z";
const diagram = (id, title, template_key, data) =>
  ({ id, title, template_key, updated_at: now, created_at: now, owner_name: "T", data });
const item = (id, shape, x, y, extra = {}) => ({ id, x, y, shape, label: `Text ${id}`, fields: {}, ...extra });

const db = new Map([
  [1, diagram(1, "DFD A", "dfd", {
    edges: [
      { id: "e1", source: "ent", target: "p0", label: "Job orders", sourceHandle: "r", targetHandle: "l" },
      { id: "e2", source: "p0", target: "st", label: "Claims", sourceHandle: "b", targetHandle: "t" },
    ],
    items: [
      item("p0", "dfd-process", 300, 0, { w: 240, h: 170, label: "NFP Portal", fields: { ref: "0", subtitle: "(NFPEIS)", description: "Job orders & dealer claims" } }),
      item("ent", "dfd-entity", 0, 40, { w: 170, h: 90, label: "Dealer", fields: { description: "Submits claims" } }),
      item("st", "dfd-store", 310, 280, { w: 220, h: 56, label: "Claims", fields: { ref: "D1" } }),
    ],
  })],
  [2, diagram(2, "Flow B", "flowchart", { edges: [], items: [item("a", "process", 0, 0, { w: 200, h: 80 })] })],
]);
let nextId = 10;
const outside = [];
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

await page.route("**/*", async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  if (url.host !== new URL(BASE).host) { outside.push(req.url()); return route.abort(); }
  if (!url.pathname.startsWith("/api/")) return route.continue();
  const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const p = url.pathname;
  if (p === "/api/auth/me") return json({ id: "1", full_name: "Tester", email: null, user_type: "System Owner", role: "owner" });
  if (p === "/api/templates") return json(["flowchart", "dfd"].map((key) => ({ key, name: tpl(key).name, version: 1, accent: tpl(key).accent })));
  if (p.startsWith("/api/templates/")) {
    const key = p.split("/").pop();
    return json({ key, name: tpl(key).name, version: 1, definition: tpl(key) });
  }
  if (p === "/api/diagrams" && req.method() === "POST") {
    const body = JSON.parse(req.postData() ?? "{}");
    const d = diagram(nextId++, body.title, body.template_key, body.data ?? { items: [], edges: [] });
    db.set(d.id, d);
    return json(d, 201);
  }
  if (p === "/api/diagrams") return json([...db.values()].map(({ data, ...s }) => s));
  const d = db.get(Number(p.split("/").pop()));
  if (!d) return json({ detail: "not found" }, 404);
  if (req.method() === "PUT" || req.method() === "PATCH") { Object.assign(d, JSON.parse(req.postData() ?? "{}")); return json(d); }
  return json(d);
});

const open = async (title) => {
  await page.goto(BASE);
  await page.getByText(title, { exact: true }).click();
  await page.locator(".react-flow__pane").waitFor();
  await page.waitForTimeout(400);
};
const node = (id) => page.locator(`.react-flow__node[data-id="${id}"]`);
const css = (loc, prop) => loc.evaluate((e, prop) => getComputedStyle(e)[prop], prop);
const save = async () => { await page.keyboard.press("Control+s"); await page.waitForTimeout(400); };
const tool = (name) => page.getByRole("button", { name, exact: true });

// --- home tile ---
await page.goto(BASE);
await page.getByText("DFD A", { exact: true }).waitFor();
ok(await page.getByRole("button", { name: /^Data Flow Diagram New/ }).count() === 1, "home shows a Data Flow Diagram tile");

// --- saved DFD renders like the picture ---
await open("DFD A");
const p0 = node("p0");
const proc = p0.locator(".shape");
ok((await p0.locator(".dfd__ref").textContent()) === "0", "process shows its number in the header band");
ok((await p0.locator(".shape__label").textContent()) === "NFP Portal", "process label");
ok((await p0.locator(".dfd__subtitle").textContent()) === "(NFPEIS)", "process second line");
ok((await p0.locator(".dfd__desc").textContent()) === "Job orders & dealer claims", "process description");
ok((await css(proc, "borderTopColor")) === "rgb(31, 107, 133)", "process outline is teal on the canvas");
ok((await css(proc, "borderTopLeftRadius")) === "14px", "process has rounded corners");
ok((await css(p0.locator(".dfd__ref"), "backgroundColor")) !== "rgba(0, 0, 0, 0)", "header band is tinted");
ok((await node("st").locator(".dfd__id").textContent()) === "D1", "data store shows its ID");
ok((await css(node("st").locator(".shape"), "borderRightWidth")) === "0px", "data store is open on the right");
ok((await css(node("ent").locator(".shape"), "boxShadow")).includes("5px 5px"), "external entity has its shadow edge");
ok(await page.locator(".react-flow__edge-text", { hasText: "Job orders" }).count() === 1, "data flow labels show");
ok(await p0.locator(".react-flow__handle").count() === 12, "process has 12 connection points");
await page.screenshot({ path: `${SHOTS}/dfd-saved.png` });

// --- Details panel: fields, edit, save ---
await p0.click();
await page.waitForTimeout(200);
const numberBox = page.getByLabel("Number", { exact: true });
ok(await numberBox.count() === 1, "Details panel shows Number for a process");
ok(await page.getByLabel("Second line").count() === 1, "Details panel shows Second line");
ok(await page.getByLabel("Description").count() === 1, "Details panel shows Description");
ok(await page.getByLabel("Notes").count() === 1, "template field Notes still shows");
await numberBox.fill("1.2");
ok((await p0.locator(".dfd__ref").textContent()) === "1.2", "editing Number updates the band");
await numberBox.fill("");
ok(await p0.locator(".dfd__ref").count() === 0, "no number = no header band");
await numberBox.fill("0");
await save();
ok(db.get(1).data.items.find((i) => i.id === "p0").fields.ref === "0", "number saved in fields.ref");
await node("st").click();
await page.waitForTimeout(200);
ok(await page.getByLabel("Store ID").count() === 1, "Details panel shows Store ID for a data store");

// --- double-click edits the label ---
await p0.dblclick();
await page.keyboard.press("Control+a");
await page.keyboard.type("Claims Hub");
await page.keyboard.press("Control+Enter");
ok((await p0.locator(".shape__label").textContent()) === "Claims Hub", "double-click edits the label");
ok((await p0.locator(".dfd__subtitle").count()) === 1, "second line back after editing");

// --- new shapes are numbered ---
const before = new Set(await page.locator(".react-flow__node").evaluateAll((ns) => ns.map((n) => n.dataset.id)));
const added = async () => {
  await page.waitForTimeout(250);
  const ids = await page.locator(".react-flow__node").evaluateAll((ns) => ns.map((n) => n.dataset.id));
  const id = ids.find((i) => !before.has(i));
  before.add(id);
  return node(id);
};
await tool("Process (numbered)").click();
ok((await (await added()).locator(".dfd__ref").textContent()) === "1", "new process after 0 is numbered 1");
await tool("Process (numbered)").click();
ok((await (await added()).locator(".dfd__ref").textContent()) === "2", "next process is 2");
await tool("Data store").click();
ok((await (await added()).locator(".dfd__id").textContent()) === "D2", "new data store after D1 is D2");
await tool("External entity").click();
ok((await (await added()).locator(".shape__label").textContent()) === "External entity", "new entity label");
await page.screenshot({ path: `${SHOTS}/dfd-added.png` });

// --- dark theme keeps document colours ---
await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
await page.waitForTimeout(200);
ok((await css(proc, "backgroundColor")) === "rgb(255, 255, 255)", "dark theme: process stays white like other shapes");
await page.screenshot({ path: `${SHOTS}/dfd-dark.png` });
await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));

// --- Flowchart offers the DFD shapes too ---
await open("Flow B");
ok(await page.getByText("Data flow (DFD)").count() >= 1, "Flowchart toolbox has a Data flow (DFD) group");
ok(await tool("Process (numbered)").count() === 1, "Flowchart offers the numbered process");

// --- new empty DFD diagram ---
await page.goto(BASE);
await page.getByRole("button", { name: /^Data Flow Diagram New/ }).click();
await page.locator(".react-flow__pane").waitFor();
await page.waitForTimeout(300);
ok(await page.getByText("Personas", { exact: true }).count() === 0, "DFD toolbox has no Personas section");

ok(pageErrors.length === 0, `no page errors ${pageErrors.join(" | ")}`);
ok(outside.length === 0, `no requests outside the app ${outside.join(" ")}`);
await browser.close();
console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exit(fail ? 1 : 0);
