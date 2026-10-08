// Font and text size, in real headless Chrome against a fake API. Same setup as image-shape.check.mjs.
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://127.0.0.1:4173";
const TEMPLATES = process.env.TEMPLATES ?? "templates";
const SHOTS = process.env.SHOTS ?? ".";

let fail = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) fail++; };
const tpl = (key) => JSON.parse(readFileSync(`${TEMPLATES}/${key}.json`, "utf8"));
const now = "2026-10-30T00:00:00Z";
const diagram = (id, title, template_key, data) =>
  ({ id, title, template_key, updated_at: now, created_at: now, owner_name: "T", data });
const item = (id, shape, x, y, extra = {}) =>
  ({ id, x, y, shape, label: `Text ${id}`, fields: {}, ...extra });

const shapes = () => ({
  edges: [{ id: "e1", source: "a", target: "b", label: "Yes", sourceHandle: "r", targetHandle: "l" }],
  items: [
    item("a", "process", 0, 0, { w: 160, h: 72 }),
    item("b", "process", 320, 0, { w: 160, h: 72 }),
    item("c", "text", 0, 160, { w: 200, h: 60 }),
    item("d", "icon", 320, 160, { icon: "user" }),
    item("e", "event-start", 0, 300),
    item("f", "persona", 320, 300),
    item("g", "decision", 0, 460, { w: 200, h: 120 }),
    item("h", "image", 320, 600, { w: 120, h: 90 }),
  ],
});
const db = new Map([
  [1, diagram(1, "Styles A", "flowchart", shapes())],
  [2, diagram(2, "Sized B", "flowchart", { edges: [], items: shapes().items.map((i) => ({ ...i, fontSize: 28, fontFamily: "courier" })) })],
  [3, diagram(3, "Hostile C", "flowchart", { edges: [], items: [item("x", "process", 0, 0, { fontFamily: "x;background:url(https://evil.example/a)", fontSize: 9999 })] })],
  [4, diagram(4, "Lanes D", "swimlane", { edges: [], items: [] })],
]);
const outside = [];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
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
  if (p === "/api/templates") return json(["flowchart", "swimlane"].map((key) => ({ key, name: tpl(key).name, version: 1 })));
  if (p.startsWith("/api/templates/")) {
    const key = p.split("/").pop();
    return json({ key, name: tpl(key).name, version: 1, definition: tpl(key) });
  }
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
  await page.waitForTimeout(400);
};
const node = (id) => page.locator(`.react-flow__node[data-id="${id}"]`);
const text = (id) => node(id).locator(".shape__label, .persona__name").first();
const css = (loc, prop) => loc.evaluate((el, prop) => getComputedStyle(el)[prop], prop);
const save = async () => { await page.keyboard.press("Control+s"); await page.waitForTimeout(300); };
const font = () => page.locator('label:has(> span:text-is("Font")) select');
const size = () => page.getByRole("combobox", { name: "Text size" });
const edgeText = () => page.locator(".react-flow__edge-text").first();

// ---------- one shape ----------
await open("Styles A");
await node("a").click();
await font().selectOption("courier");
await size().selectOption("24");
await page.waitForTimeout(100);
ok((await css(text("a"), "fontFamily")).includes("Courier New"), "font applies to the selected shape");
ok((await css(text("a"), "fontSize")) === "24px", "size applies to the selected shape");
ok((await css(text("b"), "fontSize")) === "14px", "other shapes are left alone");
await page.getByRole("button", { name: "Larger text" }).click();
ok((await css(text("a"), "fontSize")) === "28px", "+ steps up");
await page.getByRole("button", { name: "Smaller text" }).click();
await page.getByRole("button", { name: "Smaller text" }).click();
ok((await css(text("a"), "fontSize")) === "20px", "- steps down");
await size().selectOption("");
ok((await css(text("a"), "fontSize")) === "14px", "Default puts the size back");
await size().selectOption("24");

// ---------- undo ----------
await page.waitForTimeout(600);
await page.locator(".react-flow__pane").click({ position: { x: 8, y: 8 } });
await page.keyboard.press("Control+z");
await page.waitForTimeout(150);
ok((await css(text("a"), "fontSize")) === "14px", "undo reverts the size");
await page.keyboard.press("Control+y");
await page.waitForTimeout(150);
ok((await css(text("a"), "fontSize")) === "24px", "redo restores it");

// ---------- editing ----------
await node("a").dblclick();
const editor = node("a").locator("textarea");
ok((await css(editor, "fontSize")) === "24px" && (await css(editor, "fontFamily")).includes("Courier New"), "the text box you type in matches");
await page.keyboard.press("Escape");

// ---------- arrow label ----------
await page.locator(".react-flow__pane").click({ position: { x: 8, y: 8 } });
await edgeText().click({ force: true });
await page.waitForTimeout(150);
await font().selectOption("georgia");
await size().selectOption("20");
await page.waitForTimeout(150);
ok((await css(edgeText(), "fontSize")) === "20px" && (await css(edgeText(), "fontFamily")).includes("Georgia"), "arrow label takes font and size");

// ---------- everything selected ----------
await page.locator(".react-flow__pane").click({ position: { x: 8, y: 8 } });
await page.keyboard.press("Control+a");
await page.waitForTimeout(150);
ok(await page.getByText(/Changes all 9 selected items/).isVisible(), "says how many items will change");
await font().selectOption("times");
await page.waitForTimeout(150);
const all = await page.evaluate(() => [...document.querySelectorAll(".shape__label, .persona__name, .react-flow__edge-text")].every((e) => getComputedStyle(e).fontFamily.includes("Times New Roman")));
ok(all, "Ctrl+A then a font changes every shape and arrow label");

// ---------- saved and reopened ----------
await save();
const savedA = db.get(1).data;
ok(savedA.items.find((i) => i.id === "a").fontFamily === "times" && savedA.items.find((i) => i.id === "a").fontSize === 24, "font and size are saved on shapes");
ok(savedA.edges[0].fontFamily === "times" && savedA.edges[0].fontSize === 20, "font and size are saved on arrows");
ok(savedA.items.find((i) => i.id === "c").fontSize === undefined, "shapes left at Default save no size");
await open("Styles A");
ok((await css(text("a"), "fontSize")) === "24px" && (await css(text("a"), "fontFamily")).includes("Times New Roman"), "reopened shape keeps its style");
ok((await css(edgeText(), "fontSize")) === "20px", "reopened arrow keeps its style");
await page.screenshot({ path: `${SHOTS}/fonts-mixed.png` });

// ---------- copy and paste ----------
await node("a").click();
await page.keyboard.press("Control+c");
await page.keyboard.press("Control+v");
await page.waitForTimeout(300);
const pasted = await page.evaluate(() => [...document.querySelectorAll(".shape__label")].filter((e) => e.textContent === "Text a").map((e) => getComputedStyle(e).fontSize));
ok(pasted.length === 2 && pasted.every((s) => s === "24px"), "copy and paste keeps the style");

// ---------- every shape type ----------
await open("Sized B");
const sized = await page.evaluate(() => [...document.querySelectorAll(".shape__label, .persona__name")].map((e) => [e.textContent, getComputedStyle(e).fontSize, getComputedStyle(e).fontFamily.includes("Courier New")]));
ok(sized.length === 8 && sized.every(([, s, f]) => s === "28px" && f), `every shape type honours the style (${sized.length} labels)`);
await page.screenshot({ path: `${SHOTS}/fonts-sized.png` });
await node("h").click();
await page.getByLabel("Caption (optional)").fill("Caption");
await page.waitForTimeout(100);
ok((await css(node("h").locator(".shape__label"), "fontSize")) === "28px", "image captions honour it");

// ---------- export ----------
const inkInExport = async () => {
  await page.getByRole("button", { name: /Export/ }).first().click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByText("PNG", { exact: true }).first().click()]);
  const b64 = readFileSync(await download.path()).toString("base64");
  return page.evaluate(async (b64) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const x = c.getContext("2d"); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let hash = 0, dark = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 120) { dark++; hash = (hash + i) % 1000003; }
    return { dark, hash, w: c.width, h: c.height };
  }, b64);
};
db.set(5, diagram(5, "Export E", "flowchart", { edges: [], items: [item("t", "text", 0, 0, { w: 400, h: 120 }), item("u", "process", 450, 0, { w: 200, h: 120 })] }));
await open("Export E");
const plain = await inkInExport();
await node("t").click();
await size().selectOption("48");
await page.waitForTimeout(150);
const large = await inkInExport();
ok(large.dark > plain.dark * 1.5, `PNG export shows the larger size (${plain.dark} to ${large.dark} dark pixels)`);
await font().selectOption("courier");
await page.waitForTimeout(150);
const mono = await inkInExport();
ok(mono.hash !== large.hash, "PNG export shows the new font");

// ---------- moving to another lane ----------
await open("Lanes D");
await page.getByTitle(/^Task: drag/).click();
await page.waitForTimeout(300);
await size().selectOption("20");
await font().selectOption("georgia");
await save();
const lane = await page.locator(".react-flow__node-zone").first().boundingBox();
const box = await page.locator(".react-flow__node-item").boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + lane.height, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(200);
await save();
const movedItem = db.get(4).data.items[0];
ok(movedItem.fontSize === 20 && movedItem.fontFamily === "georgia", "moving to another lane keeps the style");

// ---------- hostile file ----------
await open("Hostile C");
ok((await css(text("x"), "fontSize")) === "14px" && !(await css(text("x"), "fontFamily")).includes("evil"), "bad font and size in a file fall back to default");
ok(!outside.some((u) => u.includes("evil.example")), "...and nothing is requested from outside");

ok(pageErrors.length === 0, `no page errors ${pageErrors.slice(0, 3).join(" | ")}`);
await browser.close();
console.log(fail ? `\n${fail} FAILED` : "\nALL PASSED");
process.exit(fail ? 1 : 0);
