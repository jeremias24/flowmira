# Line crossings: hops and curved ERD lines (review)

Date: 2026-10-16. Status: **applied 2026-10-16** (cardinality still open). Fixes: [`fixes/README.md`](fixes/README.md#line-hops-and-curved-erd-lines).

## Request

> "can we enable arrow curve to avoid connection confussion? not connected symbol for electronics also add arrow for cardinality"

Clarified: curves and hops in **both editors**. The crossing symbol is the electrical
"not connected" **hop** (one line jumps over the other with a small arc).

## What exists today

- **Diagram editor:** arrows can already be Straight, Elbow or Curved (Palette → Arrows → Line style,
  and the Inspector for a selected arrow). Nothing marks where two arrows cross, so a crossing
  looks the same as a junction.
- **ERD:** relationship lines are always elbows (`getSmoothStepPath`, `erd/RelationEdge.tsx`) and
  can't be changed. Many relationships into one table share corridors and cross a lot. Nothing
  marks crossings.
- **ERD cardinality:** crow's-foot marks are already drawn at both ends (fork = many, two bars =
  one). Only `"1"` and `"*"` exist (`erd/types.ts`), so there's no "zero / optional".
- Exports (PNG/PDF/GIF) capture the DOM, so anything drawn in the SVG path exports as well.

## Design

- **New `frontend/src/lineHops.tsx`.** Each line publishes its shape (flattened to a polyline)
  to a store shared by one canvas. It then redraws itself with an arc at the crossings it owns.
  - Exactly one line of each crossing hops. A horizontal-ish segment hops over a vertical-ish
    one (the schematic convention). Otherwise (diagonals, curves) the line whose id sorts last hops.
  - No hop within 12 px of either line's ends, so lines sharing a connection point don't hop
    and arrowheads stay clean. Lines running on top of each other (parallel) don't hop.
  - Two crossings closer than one arc merge into one wider arc. Arcs bulge up, or left on
    vertical lines. Radius 6 px.
  - A line without hops keeps its original path exactly, so nothing changes until lines cross.
  - Hops are part of the SVG path, so exports, GIF animation (dashes and dots) and Present mode show them.
- **Diagram editor:** Palette → Arrows → **Where arrows cross**: Hop / Plain. It applies to the
  whole diagram and is saved in `data.settings.lineHops`. It's part of undo/redo.
- **ERD:** new buttons next to Auto-arrange: **Elbow / Curved** lines and a **Hop** toggle. Both are
  saved in the ERD's `layout` (`lines`, `hops`), and also go into `.flowmira` export and "Make
  an editable copy". Curved lines still leave each table sideways, so the crow's-foot marks stay lined up.
- **Defaults:** hops are **on** for new and existing diagrams and ERDs (missing setting = on).
  ERD lines stay **Elbow** until switched.
- **No backend change.** `settings` and `layout` are free-form JSON already.

## Cardinality: crow's-foot arrow ends

ERDs already showed crow's-foot marks. Owner's choice (2026-10-16): **crow's-foot arrowheads in the
diagram editor** (option 4 of: text 1/N, arrowhead to parent, zero marks in ERD, diagram ends).
Applied 2026-10-16: see [`fixes/README.md`](fixes/README.md#crows-foot-arrow-ends-diagram-editor).

- Per arrow end: One (‖), Zero or one (o|), Many (crow's foot), One or many (|<), Zero or many (o<).
  Default None, so existing arrows don't change.
- A mark replaces the arrowhead at that end. The Arrowheads setting still applies to unmarked ends.
- Drawn in the arrow itself (not an SVG `<marker>`), so it uses the arrow's colour and selection
  highlight and shows in exports.
- Hops stay at least 26 px from either end, so they never land on a mark.

## Open questions for the owner

1. Cardinality (above).
2. Should hops default to **on** for existing diagrams? They will look slightly different after the
   update wherever arrows cross. The other choice is on for new diagrams only.
3. Hop size 6 px: OK, or larger for presenting?

## Limits

- Hops are recalculated on every move. Each line is checked against the others, skipping lines
  that are far apart. That's fine for the diagram sizes seen here (dozens of arrows). It hasn't
  been measured on hundreds of arrows.
- A hop that falls exactly on an elbow's corner draws its arc across the corner (rare).
