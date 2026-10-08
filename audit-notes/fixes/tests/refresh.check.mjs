// Refresh keeps the open diagram/ERD, in real headless Chrome against a fake API (setup as dfd-shapes.check.mjs).
// BASE is the app root including the deployment path, e.g. http://127.0.0.1:4173/flowmira/
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://127.0.0.1:4173/flowmira/";
const root = new URL(BASE).pathname;
let fail = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) fail++; };
const now = "2026-11-10T00:00:00Z";
const def = JSON.parse(readFileSync(`${process.env.TEMPLATES ?? "templates"}/flowchart.json`, "utf8"));
const tpl = { key: "flowchart", name: def.name, version: 1, accent: def.accent, definition: def };
const REF = "rUeXHnlg3RVeL652n-h1fEwlKeqto-xB"; // what the server's encrypted ref looks like
const diagram = { id: 2, ref: REF, title: "Flow B", template_key: "flowchart", updated_at: now, created_at: now, owner_name: "T",
  data: { edges: [], items: [{ id: "a", shape: "process", x: 0, y: 0, w: 200, h: 80, label: "Step", fields: {} }] } };
let role = "owner";

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.route("**/api/**", async (route) => {
  const req = route.request(); const p = new URL(req.url()).pathname;
  const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (p === "/api/auth/me") return json({ id: "1", full_name: "Tester", email: null, user_type: role === "owner" ? "System Owner" : "Regular User", role });
  if (p === "/api/templates") return json([{ key: tpl.key, name: tpl.name, version: 1, accent: tpl.accent }]);
  if (p.startsWith("/api/templates/")) return json(tpl);
  if (p === "/api/diagrams") return json([{ ...diagram, data: undefined }]);
  if (p === `/api/diagrams/by-ref/${REF}`) return json(diagram);
  if (p.startsWith("/api/diagrams/by-ref/")) return json({ detail: "Diagram not found" }, 404);
  if (p === "/api/diagrams/2") {
    if (req.method() !== "GET") { Object.assign(diagram, JSON.parse(req.postData() ?? "{}")); }
    return json(diagram);
  }
  if (p.startsWith("/api/erd")) return json({ detail: "not here" }, 404);
  return json({ detail: "not found" }, 404);
});
const path = () => new URL(page.url()).pathname;
const inEditor = () => page.locator(".react-flow").count().then((n) => n > 0);

await page.goto(BASE);
await page.getByText("Flow B", { exact: true }).click();
await page.locator(".react-flow__node").first().waitFor();
ok(path() === `${root}diagram/${REF}`, `opening a diagram puts its encrypted ref in the address (${path()})`);

await page.reload();
await page.locator(".react-flow__node").first().waitFor({ timeout: 10000 }).catch(() => {});
ok(await inEditor(), "after refresh the diagram is still open");
ok(path() === `${root}diagram/${REF}`, "address unchanged after refresh");

// Unsaved change -> refresh asks first.
const node = page.locator(".react-flow__node").first();
const box = await node.boundingBox();
await page.mouse.move(box.x + 30, box.y + 30); await page.mouse.down();
await page.mouse.move(box.x + 160, box.y + 120, { steps: 8 }); await page.mouse.up();
ok(await page.getByText("Unsaved changes").count() > 0, "moving a shape marks unsaved changes");
let asked = false;
page.once("dialog", async (d) => { asked = d.type() === "beforeunload"; await d.dismiss(); });
await page.reload({ timeout: 3000 }).catch(() => {});
ok(asked, "refresh with unsaved changes asks before leaving");
ok(await page.getByText("Unsaved changes").count() > 0, "staying keeps the unsaved changes");
await page.keyboard.press("Control+s");
await page.getByText("Unsaved changes").waitFor({ state: "detached" }).catch(() => {});
let askedAgain = false;
page.once("dialog", async (d) => { askedAgain = true; await d.accept(); });
await page.reload();
await page.locator(".react-flow__node").first().waitFor();
ok(!askedAgain, "after saving, refresh doesn't ask");

// Back to the home page resets the address.
await page.getByRole("button", { name: "Diagrams", exact: true }).click();
await page.getByText("Flow B", { exact: true }).waitFor();
ok(path() === root, `home page address is the app root (${path()})`);
await page.reload();
await page.getByText("Flow B", { exact: true }).waitFor();
ok(!(await inEditor()), "refresh on the home page stays home");

// A ref that isn't valid (altered, deleted, someone else's) says so, with a way back.
await page.goto(`${BASE}diagram/${REF.slice(0, -1)}Z`);
await page.getByText("wasn't found").waitFor({ timeout: 10000 }).catch(() => {});
ok(await page.getByText("wasn't found").count() === 1, "altered ref says the diagram wasn't found");
const backBtn = page.getByRole("button", { name: "Back to diagrams" });
await backBtn.waitFor({ timeout: 10000 }).catch(() => {});
ok(await backBtn.count() === 1, "missing diagram shows Back to diagrams");
await backBtn.click().catch(() => {});
ok(path() === root, "and Back returns to the app root");

// Old number addresses (before encryption) open the home page.
await page.goto(`${BASE}diagram/2`);
await page.getByText("Flow B", { exact: true }).waitFor();
ok(path() === root && !(await inEditor()), "old number address opens the home page");

// Regular users can't open an ERD by address.
role = "user";
await page.goto(`${BASE}erd/${REF}`);
await page.getByText("Flow B", { exact: true }).waitFor();
ok(path() === root, `ERD address for a regular user goes home (${path()})`);

// Unknown paths go home.
role = "owner";
await page.goto(`${BASE}something/else`);
await page.getByText("Flow B", { exact: true }).waitFor();
ok(!(await inEditor()), "unknown address shows the home page");

ok(errors.length === 0, `no page errors ${errors.join(" | ")}`);
await browser.close();
console.log(fail ? `${fail} FAILED` : "ALL PASSED");
process.exit(fail ? 1 : 0);
