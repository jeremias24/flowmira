// The yellow handle on elbow arrows, in every arrow layout, in real headless Chrome against a
// fake API. Same setup as image-shape.check.mjs.
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://127.0.0.1:4173";
const TEMPLATES = process.env.TEMPLATES ?? "templates";
const SHOTS = process.env.SHOTS ?? ".";

let fail = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) fail++; };
const tpl = JSON.parse(readFileSync(`${TEMPLATES}/flowchart.json`, "utf8"));
const now = "2026-10-30T00:00:00Z";
const box = (id, x, y) => ({ id, x, y, shape: "process", label: id, fields: {}, w: 160, h: 80 });

const cases = {
  "Right to Left, target ahead": [[0, 0], [400, 120], "r", "l"],
  "Right to Left, lined up": [[0, 0], [400, 0], "r", "l"],
  "Bottom to Top, target below": [[0, 0], [160, 300], "b", "t"],
  "Bottom to Top, lined up": [[0, 0], [0, 300], "b", "t"],
  "Right to Left, target behind": [[400, 0], [0, 200], "r", "l"],
  "Bottom to Top, target above": [[0, 300], [250, 0], "b", "t"],
  "Left to Right, target ahead": [[400, 0], [0, 200], "l", "r"],
  "Top to Bottom, target ahead": [[0, 300], [250, 0], "t", "b"],
  "Right to Right": [[0, 0], [300, 200], "r", "r"],
  "Left to Left": [[0, 0], [300, 200], "l", "l"],
  "Bottom to Bottom": [[0, 0], [300, 200], "b", "b"],
  "Top to Top": [[0, 0], [300, 200], "t", "t"],
  "Right to Top (one corner)": [[0, 0], [300, 200], "r", "t"],
  "Bottom to Left (one corner)": [[0, 0], [300, 200], "b", "l"],
  "Right to Top, target behind": [[400, 300], [0, 0], "r", "t"],
  "Extra points": [[0, 0], [400, 120], "r75", "l25"],
};
const names = Object.keys(cases);
const db = new Map(names.map((name, i) => {
  const [a, b, sourceHandle, targetHandle] = cases[name];
  return [i + 1, {
    id: i + 1, title: `Case ${i}`, template_key: "flowchart", updated_at: now, created_at: now, owner_name: "T",
    // m1, m2: margin, because fit-view ignores arrows and an outer arm could end up under a panel.
    data: { items: [box("a", ...a), box("b", ...b), box("m1", -300, -200), box("m2", 800, 600)], edges: [{ id: "e", source: "a", target: "b", sourceHandle, targetHandle }] },
  }];
}));
db.set(100, {
  id: 100, title: "Old bend", template_key: "flowchart", updated_at: now, created_at: now, owner_name: "T",
  data: {
    items: [box("a", 0, 0), box("b", 400, 120), box("c", 0, 300), box("d", 400, 300)],
    edges: [
      { id: "e", source: "a", target: "b", sourceHandle: "r", targetHandle: "l", bend: { x: 40, y: 0 } },
      { id: "cross", source: "c", target: "b", sourceHandle: "t", targetHandle: "b" },
    ],
  },
});

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(String(e)));

await page.route("**/*", async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  if (!url.pathname.startsWith("/api/")) return route.continue();
  const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const p = url.pathname;
  if (p === "/api/auth/me") return json({ id: "1", full_name: "T", email: null, user_type: "System Owner", role: "owner" });
  if (p === "/api/templates") return json([{ key: "flowchart", name: tpl.name, version: 1 }]);
  if (p.startsWith("/api/templates/")) return json({ key: "flowchart", name: tpl.name, version: 1, definition: tpl });
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
  await page.waitForTimeout(450);
};
const edge = '.react-flow__edge[data-id="e"] path.react-flow__edge-path';
const d = () => page.locator(edge).getAttribute("d");
/** What the line covers on screen, so a path that changes without moving doesn't count. */
const extent = () => page.locator(edge).evaluate((p) => {
  const b = p.getBBox();
  const m = p.getPointAtLength(p.getTotalLength() / 2);
  return [b.x, b.y, b.width, b.height, m.x, m.y].map(Math.round).join(",");
});
// Selecting opens the Details panel, which narrows the canvas: fit the view again afterwards.
const selectLine = async () => {
  for (const at of [0.2, 0.5, 0.8, 0.35, 0.65]) {
    const pt = await page.locator(edge).evaluate((p, at) => {
      const m = p.getPointAtLength(p.getTotalLength() * at);
      const c = p.getScreenCTM();
      return { x: m.x * c.a + c.e, y: m.y * c.d + c.f };
    }, at);
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(250);
    if (await page.locator(".edge-bend").count()) break;
  }
  await page.locator(".react-flow__controls-fitview").click();
  await page.waitForTimeout(350);
};
const drag = async (dx, dy) => {
  const b = await page.locator(".edge-bend").boundingBox();
  const [x, y] = [b.x + b.width / 2, b.y + b.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  return { x: x + dx, y: y + dy };
};

for (const [i, name] of names.entries()) {
  await open(`Case ${i}`);
  await selectLine();
  const handle = page.locator(".edge-bend");
  if (!(await handle.count())) { ok(false, `${name}: has a handle`); continue; }
  const before = await extent();
  const original = await d();
  const cls = await handle.getAttribute("class");
  const [dx, dy] = cls.includes("--xy") ? [45, 35] : cls.includes("--y") ? [0, 45] : [45, 0];
  const cursor = await drag(dx, dy);
  const b = await handle.boundingBox();
  const off = Math.hypot(b.x + b.width / 2 - cursor.x, b.y + b.height / 2 - cursor.y);
  ok((await extent()) !== before, `${name}: the line moves`);
  ok(off < 3, `${name}: the handle stays under the pointer (${off.toFixed(1)}px)`);
  if (name === "Right to Left, target behind") await page.screenshot({ path: `${SHOTS}/bend-back.png` });
  if (name === "Right to Left, lined up") await page.screenshot({ path: `${SHOTS}/bend-aligned.png` });
  const moved = await d(); // the first drag proved it moves on screen; this one may stay inside that box
  const again = await drag(dx ? 15 : 0, dy ? 15 : 0);
  const b2 = await handle.boundingBox();
  ok(Math.hypot(b2.x + b2.width / 2 - again.x, b2.y + b2.height / 2 - again.y) < 3 && (await d()) !== moved, `${name}: a second drag carries on from there`);
  await page.keyboard.press("Control+s");
  await page.waitForTimeout(300);
  const shown = (await extent()).split(",").map(Number);
  await open(`Case ${i}`);
  const reopened = (await extent()).split(",").map(Number);
  ok(reopened.every((v, j) => Math.abs(v - shown[j]) <= 2), `${name}: saved and reopened the same (bends round to whole pixels)`);
  await selectLine();
  await page.locator(".edge-bend").dblclick({ timeout: 5000 }).catch(() => ok(false, `${name}: handle after reopening`));
  await page.waitForTimeout(200);
  ok((await d()) === original, `${name}: double-click puts it back`);
}

await open("Old bend");
const old = await d();
ok(old.includes("320,45"), `a bend saved by the old code stays where it was: middle of 165-395, plus 40 (${old})`);

ok(problems.length === 0, `no page errors ${problems.slice(0, 3).join(" | ")}`);
await browser.close();
console.log(fail ? `${fail} FAILED` : "ALL PASSED");
process.exit(fail ? 1 : 0);
