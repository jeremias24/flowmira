// Image shape, in real headless Chrome against a fake API. Needs a built frontend served at BASE
// (vite preview) with VITE_API_URL="", and TEMPLATES pointing at backend/templates.
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://127.0.0.1:4173";
const TEMPLATES = process.env.TEMPLATES ?? "templates";
const SHOTS = process.env.SHOTS ?? ".";

let fail = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) fail++; };
const tpl = (key) => JSON.parse(readFileSync(`${TEMPLATES}/${key}.json`, "utf8"));
const now = "2026-10-30T00:00:00Z";
const empty = { items: [], edges: [] };
const diagram = (id, title, template_key, data = empty) =>
  ({ id, title, template_key, updated_at: now, created_at: now, owner_name: "T", data });

const db = new Map([
  [1, diagram(1, "Flow A", "flowchart")],
  [2, diagram(2, "Lanes B", "swimlane")],
  [3, diagram(3, "Columns C", "sipoc")],
  [4, diagram(4, "Hostile D", "flowchart", {
    edges: [],
    items: [{ id: "x", x: 0, y: 0, w: 200, h: 150, shape: "image", label: "", fields: {}, image: "https://evil.example/track.png" }],
  })],
  [5, diagram(5, "Full E", "flowchart")],
  [6, diagram(6, "Present F", "flowchart")],
  [7, diagram(7, "Resize G", "flowchart")],
]);
const outside = [];
const puts = [];

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
  if (p === "/api/templates") return json(["flowchart", "swimlane", "sipoc"].map((key) => ({ key, name: tpl(key).name, version: 1 })));
  if (p.startsWith("/api/templates/")) {
    const key = p.split("/").pop();
    return json({ key, name: tpl(key).name, version: 1, definition: tpl(key) });
  }
  if (p === "/api/diagrams") return json([...db.values()].map(({ data, ...s }) => s));
  const d = db.get(Number(p.split("/").pop()));
  if (!d) return json({ detail: "not found" }, 404);
  if (req.method() === "PUT") {
    const body = req.postDataJSON();
    puts.push(req.postData().length);
    Object.assign(d, body);
    return json(d);
  }
  return json(d);
});

/** A PNG made in the page. kind: solid (red), noise, alpha (noise with transparent parts). */
const png = (w, h, kind) => page.evaluate(({ w, h, kind }) => {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const x = c.getContext("2d");
  if (kind === "solid") { x.fillStyle = "#ff0000"; x.fillRect(0, 0, w, h); }
  else {
    const d = x.createImageData(w, h);
    for (let i = 0; i < d.data.length; i += 4) {
      d.data[i] = Math.random() * 256; d.data[i + 1] = Math.random() * 256; d.data[i + 2] = Math.random() * 256;
      d.data[i + 3] = kind === "alpha" && i % 8 === 0 ? 0 : 255;
    }
    x.putImageData(d, 0, 0);
  }
  return c.toDataURL("image/png").split(",")[1];
}, { w, h, kind });

const file = (b64, name = "pic.png", mimeType = "image/png") => ({ name, mimeType, buffer: Buffer.from(b64, "base64") });
const addByPicker = async (...files) => {
  await page.getByRole("tab", { name: "Shapes" }).click();
  await page.getByLabel("Choose pictures to add").setInputFiles(files);
};
const images = () => page.locator(".shape--image").count();
const waitImages = (n) => page.waitForFunction((n) => document.querySelectorAll(".shape--image").length === n, n, { timeout: 15000 });
const save = async () => { await page.keyboard.press("Control+s"); await page.getByText(/^Saved/).first().waitFor({ timeout: 10000 }).catch(() => undefined); await page.waitForTimeout(200); };
const open = async (title) => {
  await page.goto(BASE);
  await page.getByText(title, { exact: true }).click();
  await page.locator(".react-flow__pane").waitFor();
  await page.waitForTimeout(300);
};
const clickPane = async () => {
  const b = await page.locator(".react-flow__pane").boundingBox();
  await page.mouse.click(b.x + 12, b.y + b.height - 12);
};
const pasteFile = (b64) => page.evaluate((b64) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const dt = new DataTransfer();
  dt.items.add(new File([bytes], "shot.png", { type: "image/png" }));
  document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
}, b64);
const dropFile = (b64, name = "drop.png", type = "image/png") => page.evaluate(({ b64, name, type }) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const dt = new DataTransfer();
  dt.items.add(new File([bytes], name, { type }));
  const el = document.querySelector(".react-flow__pane");
  const r = el.getBoundingClientRect();
  const at = { clientX: r.left + r.width * 0.3, clientY: r.top + r.height * 0.3, bubbles: true, cancelable: true, dataTransfer: dt };
  el.dispatchEvent(new DragEvent("dragover", at));
  return el.dispatchEvent(new DragEvent("drop", at)); // false = the browser was stopped from opening the file
}, { b64, name, type });

// ---------- flowchart: picker, shrink, proportions ----------
await open("Flow A");
const big = await png(3000, 2000, "solid");
await addByPicker(file(big));
await waitImages(1);
const dims = await page.evaluate(() => {
  const img = document.querySelector(".shape--image img");
  const box = img.closest(".react-flow__node").getBoundingClientRect();
  const zoom = Number(/scale\(([\d.]+)\)/.exec(document.querySelector(".react-flow__viewport").style.transform)?.[1] ?? 1);
  return { nw: img.naturalWidth, nh: img.naturalHeight, w: box.width / zoom, h: box.height / zoom, src: img.src.slice(0, 22) };
});
ok(dims.nw === 1600 && dims.nh === 1067, `3000x2000 shrinks to 1600 px wide (${dims.nw}x${dims.nh})`);
ok(Math.abs(dims.w / dims.h - 1.5) < 0.02, `starts at the picture's proportions (${dims.w}x${dims.h})`);
ok(await page.getByText("Image", { exact: true }).first().isVisible(), "Inspector shows the Image panel");
ok(await page.getByRole("button", { name: "Replace image" }).isVisible(), "Replace image button shown");
ok(await page.getByRole("button", { name: "Delete image" }).isVisible(), "Delete says image");
ok(!(await page.getByLabel("Fill", { exact: true }).count()), "no Fill control on images");

// ---------- paste and drop ----------
await clickPane();
await pasteFile(await png(400, 300, "solid"));
await waitImages(2);
ok(true, "pasted screenshot becomes an image");
ok((await dropFile(await png(300, 300, "solid"))) === false, "dropped file doesn't open in the browser");
await waitImages(3);
ok(true, "dropped file becomes an image");

// ---------- refused files ----------
await page.getByLabel("Choose pictures to add").setInputFiles(
  { name: "x.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>") },
);
await page.getByText(/"x\.svg" can't be added/).waitFor({ timeout: 4000 });
ok(await images() === 3, "SVG refused with a message");
await page.getByLabel("Choose pictures to add").setInputFiles({ name: "bad.png", mimeType: "image/png", buffer: Buffer.from("not a picture") });
await page.getByText(/"bad\.png" couldn't be read/).waitFor({ timeout: 4000 });
ok(await images() === 3, "damaged file refused with a message");

// ---------- transparency ----------
await addByPicker(file(await png(900, 700, "alpha"), "alpha.png"));
await waitImages(4);
await page.waitForTimeout(100);
const kept = await page.evaluate(async () => {
  const img = [...document.querySelectorAll(".shape--image img")].pop();
  const c = document.createElement("canvas"); c.width = 20; c.height = 20;
  const x = c.getContext("2d");
  x.drawImage(img, 0, 0, 20, 20, 0, 0, 20, 20);
  const d = x.getImageData(0, 0, 20, 20).data;
  let clear = 0; for (let i = 3; i < d.length; i += 4) if (d[i] === 0) clear++;
  return { clear, kind: img.src.slice(5, 15) };
});
ok(kept.clear > 0, `transparent parts survive (${kept.clear}/400 clear, ${kept.kind})`);

// ---------- save ----------
await save();
const saved = db.get(1).data.items;
ok(saved.length === 4 && saved.every((i) => i.shape === "image" && i.image.startsWith("data:image/")), "Save stores all 4 pictures in the diagram");
ok(saved.every((i) => !i.image.startsWith("image-")), "Save never stores an undo reference");

// ---------- undo / redo / copy ----------
await page.keyboard.press("Control+z");
await waitImages(3);
await page.keyboard.press("Control+y");
await waitImages(4).catch(() => undefined);
if (await images() !== 4) { await page.keyboard.press("Control+Shift+z"); await waitImages(4); }
const restored = await page.evaluate(() => [...document.querySelectorAll(".shape--image img")].every((i) => i.src.startsWith("data:image/")));
ok(restored, "undo then redo brings the real picture back");
await page.locator(".shape--image").last().click();
await page.keyboard.press("Control+c");
await page.keyboard.press("Control+v");
await waitImages(5);
await page.waitForTimeout(100);
ok(await page.evaluate(() => [...document.querySelectorAll(".shape--image img")].every((i) => i.naturalWidth > 0)), "copy and paste a picture shape");
await page.keyboard.press("Control+z");
await waitImages(4);

// ---------- caption ----------
await page.locator(".shape--image").last().click();
await page.getByLabel("Caption (optional)").fill("Line 3 photo");
await page.waitForTimeout(100);
ok(await page.locator(".shape--image .shape__caption").getByText("Line 3 photo").isVisible(), "caption shows under the picture");
ok((await page.locator(".shape--image").last().locator("img").getAttribute("alt")) === "Line 3 photo", "caption is the alt text");

// ---------- replace ----------
await page.getByRole("button", { name: "Replace image" }).click({ trial: true });
await page.getByLabel("Choose a picture").setInputFiles(file(await png(200, 400, "solid"), "tall.png"));
await page.waitForFunction(() => {
  const n = [...document.querySelectorAll(".shape--image")].pop().closest(".react-flow__node").getBoundingClientRect();
  return n.height > n.width * 1.5 && n.height < 340;
}, null, { timeout: 5000 });
ok(true, "Replace image takes the new proportions and keeps the longest side");

// ---------- export ----------
await save();
await page.screenshot({ path: `${SHOTS}/flowchart-light.png` });
await page.getByRole("button", { name: /Export/ }).first().click();
const [download] = await Promise.all([page.waitForEvent("download"), page.getByText("PNG", { exact: true }).first().click()]);
const exported = (await import("node:fs")).readFileSync(await download.path()).toString("base64");
const redShare = await page.evaluate(async (b64) => {
  const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const x = c.getContext("2d"); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let red = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 240 && d[i + 1] < 20 && d[i + 2] < 20) red++;
  return red / (d.length / 4);
}, exported);
ok(redShare > 0.02, `PNG export contains the pictures (${(redShare * 100).toFixed(1)}% red pixels)`);

// ---------- reopen ----------
await open("Flow A");
await waitImages(4);
ok(await page.evaluate(() => [...document.querySelectorAll(".shape--image img")].every((i) => i.src.startsWith("data:image/"))), "reopened diagram shows its pictures");

// ---------- dark mode ----------
await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; document.documentElement.style.colorScheme = "dark"; });
await page.screenshot({ path: `${SHOTS}/flowchart-dark.png` });

// ---------- lanes: size, and moving to another lane ----------
await open("Lanes B");
await addByPicker(file(await png(1200, 1200, "solid")));
await waitImages(1);
const laneFit = await page.evaluate(() => {
  const n = document.querySelector(".shape--image").closest(".react-flow__node");
  const lane = n.parentElement.querySelector(".react-flow__node-zone");
  return { n: n.getBoundingClientRect().height, lane: lane.getBoundingClientRect().height };
});
ok(laneFit.n < laneFit.lane, `fits inside the lane (${laneFit.n.toFixed(0)} < ${laneFit.lane.toFixed(0)})`);
await save();
const startZone = db.get(2).data.items[0].zone;
const box = await page.locator(".shape--image").boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + laneFit.lane, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(150);
await save();
const moved = db.get(2).data.items[0];
ok(moved.zone !== startZone && moved.image?.startsWith("data:image/"), `moving to another lane keeps the picture (${startZone} to ${moved.zone})`);
await page.screenshot({ path: `${SHOTS}/swimlane.png` });

// ---------- columns ----------
await open("Columns C");
await addByPicker(file(await png(1000, 500, "solid")));
await waitImages(1);
const colFit = await page.evaluate(() => {
  const n = document.querySelector(".shape--image").closest(".react-flow__node");
  const col = n.parentElement.querySelector(".react-flow__node-zone");
  return { n: n.getBoundingClientRect().width, col: col.getBoundingClientRect().width };
});
ok(colFit.n < colFit.col, `fits inside the column (${colFit.n.toFixed(0)} < ${colFit.col.toFixed(0)})`);

// ---------- resize keeps proportions ----------
await open("Resize G");
await addByPicker(file(await png(800, 400, "solid")));
await waitImages(1);
await page.waitForTimeout(200);
await page.locator(".shape--image").click();
const before = await page.locator(".shape--image").boundingBox();
const grip = page.locator(".react-flow__resize-control.handle.bottom.right");
console.log("     grips", await grip.count(), JSON.stringify(await grip.first().boundingBox()), JSON.stringify(before));
const g = await grip.first().boundingBox();
await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
await page.mouse.down();
await page.mouse.move(g.x + g.width / 2 + 90, g.y + g.height / 2 + 45, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(150);
const after = await page.locator(".shape--image").boundingBox();
ok(after.width > before.width && Math.abs(after.width / after.height - before.width / before.height) < 0.03,
  `resizing keeps proportions (${before.width.toFixed(0)}x${before.height.toFixed(0)} to ${after.width.toFixed(0)}x${after.height.toFixed(0)})`);

// ---------- hostile diagram ----------
await open("Hostile D");
await page.getByText("Image missing").waitFor({ timeout: 4000 });
ok(!outside.some((u) => u.includes("evil.example")), "a web address in saved data is never requested");
ok(await page.locator(".shape--image img").count() === 0, "...and shows Image missing instead");

// ---------- the 10 MB limit ----------
await open("Full E");
const noise = `${SHOTS}/noise.png`; // a path: Playwright refuses over 50 MB of in-memory files
writeFileSync(noise, Buffer.from(await png(1600, 1200, "noise"), "base64"));
await addByPicker(...Array(14).fill(noise));
await page.getByText(/This diagram is full/).waitFor({ timeout: 60000 });
const full = await images();
ok(full > 1 && full < 14, `stops adding when the diagram is full (${full} of 14 added)`);
await save();
ok(puts[puts.length - 1] < 10 * 1024 * 1024, `what's left saves under nginx's 10 MB (${(puts[puts.length - 1] / 1048576).toFixed(1)} MB)`);
const beforeCopies = puts.length;
await page.locator(".shape--image").last().click();
await page.keyboard.press("Control+a");
await page.keyboard.press("Control+d");
await page.waitForTimeout(400);
await page.keyboard.press("Control+s");
await page.getByText(/Too large to save/).waitFor({ timeout: 5000 });
ok(puts.length === beforeCopies, "duplicated past the limit: says so, and sends nothing");

// ---------- undo memory ----------
const cdp = await context.newCDPSession(page);
const heap = async () => {
  await cdp.send("HeapProfiler.collectGarbage");
  return (await cdp.send("Runtime.getHeapUsage")).usedSize / 1048576;
};
await open("Present F");
await addByPicker(...Array(4).fill(noise));
await waitImages(4);
await page.waitForTimeout(700);
const start = await heap();
for (let i = 0; i < 25; i++) {
  await page.locator(".shape--image").last().click();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(450);
}
const growth = (await heap()) - start;
const perStep = (await page.evaluate(() => [...document.querySelectorAll(".shape--image img")].reduce((s, i) => s + i.src.length, 0))) / 1048576;
ok(growth < perStep * 3, `25 undo steps add ${growth.toFixed(1)} MB; without this it would be about ${(perStep * 25).toFixed(0)} MB`);

// ---------- present mode is read-only ----------
await page.getByRole("button", { name: /Present/ }).first().click();
await page.waitForTimeout(300);
await pasteFile(await png(100, 100, "solid"));
await dropFile(await png(100, 100, "solid"));
await page.waitForTimeout(500);
ok(await images() === 4, "paste and drop do nothing while presenting");

ok(pageErrors.length === 0, `no page errors ${pageErrors.slice(0, 3).join(" | ")}`);
await browser.close();
console.log(fail ? `\n${fail} FAILED` : "\nALL PASSED");
process.exit(fail ? 1 : 0);
