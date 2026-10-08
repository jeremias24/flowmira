import { endMark, END_MARKS, isEndMark } from "./crowsFoot.mjs";
import { styleEdge, edgeFromSaved, edgeToSaved } from "./edges.mjs";
let fail = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
// orientation: line leaving to the right of (100,100)
const many = endMark({ x: 100, y: 100 }, { x: 1, y: 0 }, "many");
ok(many.d === "M 114.00,100.00 L 100.00,93.00 M 114.00,100.00 L 100.00,100.00 M 114.00,100.00 L 100.00,107.00", `many, rightwards: ${many.d}`);
// leaving upwards from a Top handle: prongs spread sideways (x), tip above
const up = endMark({ x: 100, y: 100 }, { x: 0, y: -1 }, "oneOrMany");
ok(up.d.startsWith("M 100.00,86.00 L 93.00,100.00") && up.d.includes("M 94.00,82.00 L 106.00,82.00"), `oneOrMany, upwards: ${up.d}`);
const z1 = endMark({ x: 0, y: 0 }, { x: 1, y: 0 }, "zeroOrOne");
ok(z1.circle && z1.circle.x === 18 && z1.d === "M 9.00,-6.00 L 9.00,6.00", `zeroOrOne: bar at 9, circle at 18`);
const zm = endMark({ x: 0, y: 0 }, { x: -1, y: 0 }, "zeroOrMany");
ok(zm.circle && zm.circle.x === -22, `zeroOrMany leftwards: circle at -22 (${zm.circle?.x})`);
ok(endMark({ x: 0, y: 0 }, { x: 1, y: 0 }, "one").d === "M 9.00,-6.00 L 9.00,6.00 M 14.00,-6.00 L 14.00,6.00", "one: two bars");
ok(END_MARKS.length === 5 && isEndMark("many") && !isEndMark("arrow") && !isEndMark(""), "isEndMark");
// arrowheads give way to marks
const base = { id: "e", source: "a", target: "b" };
const e1 = styleEdge({ ...base, data: { kind: "elbow", dashed: false, arrow: "both", endMark: "many" } });
ok(!e1.markerEnd && !!e1.markerStart, "endMark removes end arrowhead, start arrowhead stays");
const e2 = styleEdge({ ...base, data: { kind: "elbow", dashed: false, arrow: "both", startMark: "one" } });
ok(!!e2.markerEnd && !e2.markerStart, "startMark removes start arrowhead");
const e3 = styleEdge({ ...base, data: { kind: "elbow", dashed: false, arrow: "end" } });
ok(!!e3.markerEnd && !e3.markerStart, "no marks: unchanged arrowheads");
// save / load
const saved = edgeToSaved(edgeFromSaved({ ...base, startMark: "zeroOrMany", endMark: "one" }));
ok(saved.startMark === "zeroOrMany" && saved.endMark === "one", "marks survive save → load → save");
const plain = edgeToSaved(edgeFromSaved({ ...base }));
ok(!("startMark" in plain) && !("endMark" in plain), "old arrows save without mark fields");
ok(!("endMark" in edgeFromSaved({ ...base, endMark: "bogus" }).data), "unknown mark value dropped");
process.exit(fail ? 1 : 0);
