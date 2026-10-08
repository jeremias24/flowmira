import { flattenPath, hopDistances, hoppedPath } from "./lineHops.mjs";
import { getSmoothStepPath, getBezierPath, getStraightPath, Position } from "@xyflow/system";
let fail = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const P = (d) => flattenPath(d);
// 1. elbow: horizontal A (y=100, x 0..200) vs vertical B (x=100, y 0..200)
const [hA] = getStraightPath({ sourceX: 0, sourceY: 100, targetX: 200, targetY: 100 });
const [vB] = getSmoothStepPath({ sourceX: 100, sourceY: 0, sourcePosition: Position.Bottom, targetX: 100, targetY: 200, targetPosition: Position.Top });
const A = P(hA), B = P(vB);
const others = [["a", A], ["b", B]];
const ha = hopDistances("a", A, others), hb = hopDistances("b", B, others);
ok(ha.length === 1 && Math.abs(ha[0] - 100) < 0.5, `horizontal hops once at 100: ${ha}`);
ok(hb.length === 0, `vertical does not hop: ${hb}`);
const d = hoppedPath(A, ha);
ok(/A 6 6 0 0 1 106,100/.test(d), `arc bulges up: ${d}`);
// 2. two elbows (smoothstep with corners) crossing
const [s1] = getSmoothStepPath({ sourceX: 0, sourceY: 0, sourcePosition: Position.Right, targetX: 300, targetY: 200, targetPosition: Position.Left });
const [s2] = getSmoothStepPath({ sourceX: 220, sourceY: -50, sourcePosition: Position.Bottom, targetX: 80, targetY: 260, targetPosition: Position.Top });
console.log("   smoothstep:", s1);
const S1 = P(s1), S2 = P(s2);
const o2 = [["s1", S1], ["s2", S2]];
const n1 = hopDistances("s1", S1, o2).length, n2 = hopDistances("s2", S2, o2).length;
ok(n1 === 0 && n2 === 1, `crossing elbows: only the horizontal middle of s2 hops (s1=${n1} s2=${n2})`);
// 3. two beziers forming an X: exactly one hops
const [c1] = getBezierPath({ sourceX: 0, sourceY: 0, sourcePosition: Position.Right, targetX: 300, targetY: 200, targetPosition: Position.Left });
const [c2] = getBezierPath({ sourceX: 0, sourceY: 200, sourcePosition: Position.Right, targetX: 300, targetY: 0, targetPosition: Position.Left });
console.log("   bezier:", c2);
const C1 = P(c1), C2 = P(c2);
const o3 = [["c1", C1], ["c2", C2]];
const k1 = hopDistances("c1", C1, o3), k2 = hopDistances("c2", C2, o3);
ok(k1.length + k2.length === 1, `curves: exactly one hop (c1=${k1.length}, c2=${k2.length})`);
ok(/ A /.test(hoppedPath(k1.length ? C1 : C2, k1.length ? k1 : k2)), "curve hopped path contains an arc");
// 4. shared endpoint: no hop
const E1 = P("M 0,0 L 100,100"), E2 = P("M 0,100 L 100,0"), E3 = P("M 100,100 L 200,0");
const o4 = [["e1", E1], ["e3", E3]];
ok(hopDistances("e1", E1, o4).length + hopDistances("e3", E3, o4).length === 0, "lines meeting at an end don't hop");
const o5 = [["e1", E1], ["e2", E2]];
ok(hopDistances("e1", E1, o5).length + hopDistances("e2", E2, o5).length === 1, "diagonal X: one hop");
// 5. two crossings close together merge into one arc
const H = P("M 0,50 L 200,50"), V1 = P("M 98,0 L 98,100"), V2 = P("M 104,0 L 104,100");
const hh = hopDistances("h", H, [["h", H], ["v1", V1], ["v2", V2]]);
const merged = hoppedPath(H, hh);
ok(hh.length === 2 && (merged.match(/ A /g) || []).length === 1, `close crossings merge: ${merged}`);
// 6. unsupported path → null
ok(flattenPath("m 0 0 l 10 10") === null, "relative path is ignored");
process.exit(fail ? 1 : 0);
