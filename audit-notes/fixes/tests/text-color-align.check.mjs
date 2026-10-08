// Text color and alignment, in real headless Chrome against a fake API. Same setup as font-text.check.mjs.
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

const RED = "rgb(178, 58, 47)";
const shapes = () => ({
  edges: [{ id: "e1", source: "a", target: "b", label: "Yes", sourceHandle: "r", targetHandle: "l" }],
  items: [
    item("a", "process", 0, 0, { w: 200, h: 80 }),
    item("b", "process", 320, 0, { w: 200, h: 80 }),
    item("c", "text", 0, 160, { w: 200, h: 60 }),
    item("d", "icon", 320, 160, { icon: "user", w: 120, h: 100 }),
    item("e", "event-start", 0, 300, { w: 120, h: 100 }),
    item("f", "persona", 320, 300),
    item("g", "decision", 0, 460, { w: 240, h: 120 }),
    item("i", "card", 320, 640, { w: 200, h: 80 }),
  ],
});
const db = new Map([
  [1, diagram(1, "Styles A", "flowchart", shapes())],
  [2, diagram(2, "Saved B", "flowchart", { edges: [], items: shapes().items.map((i) => ({ ...i, textColor: "#B23A2F", textAlign: "right" })) })],
  [3, diagram(3, "Hostile C", "flowchart", { edges: [], items: [item("x", "process", 0, 0, { textColor: "red;background:url(https://evil.example/a)", textAlign: "x;y" })] })],
  [4, diagram(4, "Lanes D", "swimlane", { edges: [], items: [] })],
  [5, diagram(5, "Dark E", "flowchart", { edges: [], items: [item("t", "text", 0, 0, { w: 300, h: 100, textColor: "#B23A2F" }), item("n", "text", 0, 120, { w: 300, h: 100 })] })],
  [6, diagram(6, "Strong F", "flowchart", { edges: [], items: [item("s", "process", 0, 0, { w: 200, h: 80, fill: "#16222E" })] })],
]);
const outside = [];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
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
  if (req.method() === "PUT" || req.method() === "PATCH") {
    Object.assign(d, JSON.parse(req.postData() ?? "{}"));
    return json(d);
  }
  return json(d);
});

const open = async (title) => {
  await page.goto(BASE);
  await page.getByText(title, { exact: true }).click();
  await page.locator(".react-flow__pane").waitFor();
  await page.waitForTimeout(300);
};
const node = (id) => page.locator(`.react-flow__node[data-id="${id}"]`);
const label = (id) => node(id).locator(".shape__label, .persona__name").first();
const css = (loc, prop) => loc.evaluate((e, prop) => getComputedStyle(e)[prop], prop);
const edgeText = () => page.locator(".react-flow__edge-text").first();
const save = async () => { await page.keyboard.press("Control+s"); await page.waitForTimeout(400); };
const pickRed = () => page.getByRole("radiogroup", { name: "Text color" }).getByRole("radio", { name: "Red" }).click();
const align = (name) => page.getByRole("button", { name }).click();
// Where the text's own box sits inside the shape: positive = closer to the right edge.
const side = (id) => page.evaluate((id) => {
  const n = document.querySelector(`.react-flow__node[data-id="${id}"]`);
  const l = n.querySelector(".shape__label, .persona__name");
  const range = document.createRange(); range.selectNodeContents(l);
  const t = range.getBoundingClientRect(), b = n.getBoundingClientRect();
  return Math.round((t.left - b.left) - (b.right - t.right));
}, id);

// ---------- defaults ----------
await open("Styles A");
const before = await css(label("a"), "color");
await node("a").click();
await page.waitForTimeout(200);
ok(await page.getByRole("button", { name: "Align center" }).getAttribute("aria-pressed") === "true", "a process shows Center as its alignment");
ok(Math.abs(await side("a")) <= 2, "nothing chosen: process text stays centered");
await node("i").click();
await page.waitForTimeout(200);
ok(await page.getByRole("button", { name: "Align left" }).getAttribute("aria-pressed") === "true", "a card shows Left as its alignment");
ok((await side("i")) < -40, "nothing chosen: card text stays left");

// ---------- one shape ----------
await node("a").click();
await page.waitForTimeout(200);
await pickRed();
await page.waitForTimeout(150);
ok((await css(label("a"), "color")) === RED, "picking a color changes the shape's text");
ok((await css(label("b"), "color")) === before, "...and no other shape");
await align("Align left");
await page.waitForTimeout(150);
const left = await side("a");
await align("Align right");
await page.waitForTimeout(150);
const right = await side("a");
await align("Align center");
await page.waitForTimeout(150);
const middle = await side("a");
ok(left < -40 && right > 40 && Math.abs(middle) <= 2, `left, right and center move the text (${left}, ${right}, ${middle})`);
await align("Align right");
await page.getByRole("radiogroup", { name: "Text color" }).getByRole("radio", { name: "Default" }).click();
await page.waitForTimeout(150);
ok((await css(label("a"), "color")) === before, "Default puts the text color back");

// ---------- editing keeps the look ----------
await pickRed();
await page.waitForTimeout(150);
await node("a").dblclick();
const editor = node("a").locator("textarea");
ok((await css(editor, "color")) === RED && (await css(editor, "textAlign")) === "right", "the text box shows the same color and alignment while typing");
await page.keyboard.press("Escape");

// ---------- arrows ----------
await page.locator(".react-flow__edge").first().click({ force: true });
await page.waitForTimeout(200);
ok(await page.getByRole("button", { name: "Align left" }).count() === 0, "arrows have no alignment buttons");
await pickRed();
await page.waitForTimeout(150);
ok((await css(edgeText(), "fill")) === RED, "arrow labels change color");
ok(!(await page.locator(".react-flow__edge-path").first().evaluate((e) => getComputedStyle(e).stroke)).includes("178, 58, 47"), "...the line itself doesn't");

// ---------- everything selected ----------
await page.locator(".react-flow__pane").click({ position: { x: 900, y: 800 } });
await page.keyboard.press("Control+a");
await page.waitForTimeout(250);
await pickRed();
await page.waitForTimeout(150);
await align("Align right");
await page.waitForTimeout(200);
const all = await page.evaluate((RED) => [...document.querySelectorAll(".shape__label, .persona__name, .react-flow__edge-text")]
  .every((e) => (e.tagName === "text" ? getComputedStyle(e).fill : getComputedStyle(e).color) === RED), RED);
ok(all, "Ctrl+A then a color changes every shape and arrow label");
await page.screenshot({ path: `${SHOTS}/text-all-right.png` });

// ---------- saved and reopened ----------
await save();
const saved = db.get(1).data;
ok(saved.items.every((i) => i.textColor === "#B23A2F" && i.textAlign === "right"), "color and alignment are saved on shapes");
ok(saved.edges[0].textColor === "#B23A2F" && saved.edges[0].textAlign === undefined, "color is saved on arrows, alignment isn't");
await open("Styles A");
ok((await css(label("c"), "color")) === RED && (await side("c")) > 0, "reopened shape keeps its style");
ok((await css(edgeText(), "fill")) === RED, "reopened arrow keeps its color");

// ---------- copy and paste ----------
await node("a").click();
await page.keyboard.press("Control+c");
await page.keyboard.press("Control+v");
await page.waitForTimeout(300);
const pasted = await page.evaluate(() => [...document.querySelectorAll(".shape__label")].filter((e) => e.textContent === "Text a").map((e) => [getComputedStyle(e).color, getComputedStyle(e.parentElement).alignItems]));
ok(pasted.length === 2 && pasted.every(([c, a]) => c === "rgb(178, 58, 47)" && a === "flex-end"), "copy and paste keeps the style");

// ---------- every shape type ----------
await open("Saved B");
const every = await page.evaluate(() => [...document.querySelectorAll(".shape__label, .persona__name")].map((e) => [e.textContent, getComputedStyle(e).color]));
ok(every.length === 8 && every.every(([, c]) => c === "rgb(178, 58, 47)"), `every shape type honours the color (${every.length} labels)`);
const sides = {};
for (const id of ["a", "c", "d", "e", "g", "i"]) sides[id] = await side(id);
ok(Object.values(sides).every((s) => s > 8), `every shape type honours Right (${JSON.stringify(sides)})`);
const nameAlign = await css(node("f").locator(".persona__name"), "textAlign");
ok(nameAlign === "right", "persona names honour it");
await page.screenshot({ path: `${SHOTS}/text-every-shape.png` });

// ---------- dark fills and dark mode ----------
await open("Strong F");
ok((await css(label("s"), "color")) === "rgb(255, 255, 255)", "dark fill with no chosen color still turns white");
await node("s").click();
await page.waitForTimeout(200);
await page.getByRole("radiogroup", { name: "Text color" }).getByRole("radio", { name: "Yellow" }).click();
await page.waitForTimeout(150);
ok((await css(label("s"), "color")) === "rgb(212, 167, 44)", "a chosen color wins over the automatic white");

await open("Dark E");
await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
await page.waitForTimeout(150);
ok((await css(label("t"), "color")) === RED, "a chosen color stays in dark mode");
ok((await css(label("n"), "color")) !== RED && (await css(label("n"), "color")) !== "rgb(22, 34, 46)", "default text on the canvas still turns light in dark mode");
await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));

// ---------- export ----------
const redInExport = async () => {
  await page.getByRole("button", { name: /Export/ }).first().click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByText("PNG", { exact: true }).first().click()]);
  const b64 = readFileSync(await download.path()).toString("base64");
  return page.evaluate(async (b64) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const x = c.getContext("2d"); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let red = 0, sum = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] < 90 && d[i + 2] < 90) { red++; sum += (i / 4) % c.width; }
    return { red, meanX: red ? sum / red : 0, w: c.width };
  }, b64);
};
await open("Dark E");
const onLeft = await (async () => {
  await node("t").click(); await page.waitForTimeout(200);
  await align("Align left"); await page.waitForTimeout(150);
  return redInExport();
})();
await align("Align right");
await page.waitForTimeout(150);
const onRight = await redInExport();
ok(onLeft.red > 50, `PNG export shows the color (${onLeft.red} red pixels)`);
ok(onRight.meanX > onLeft.meanX + onLeft.w * 0.2, `PNG export shows the alignment (${Math.round(onLeft.meanX)} to ${Math.round(onRight.meanX)} of ${onLeft.w})`);

// ---------- moving to another lane ----------
await open("Lanes D");
await page.getByTitle(/^Task: drag/).click();
await page.waitForTimeout(300);
await pickRed();
await align("Align right");
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
ok(movedItem.textColor === "#B23A2F" && movedItem.textAlign === "right", "moving to another lane keeps the style");

// ---------- hostile file ----------
await open("Hostile C");
ok((await css(label("x"), "color")) === before && Math.abs(await side("x")) <= 2, "bad color and alignment in a file fall back to default");
ok(!outside.some((u) => u.includes("evil.example")), "...and nothing is requested from outside");

ok(pageErrors.length === 0, `no page errors ${pageErrors.slice(0, 3).join(" | ")}`);
await browser.close();
console.log(fail ? `\n${fail} FAILED` : "\nALL PASSED");
process.exit(fail ? 1 : 0);
