// Shared image/PDF export for React Flow canvases (used by the ERD module).
import { getViewportForBounds, type Rect } from "@xyflow/react";
import { getFontEmbedCSS, toCanvas } from "html-to-image";

let fontCss: string | null = null;

/**
 * Capture everything inside `bounds` from the flow under `container` (the element that
 * holds .react-flow). Document colours and no editing aids: `container` gets the
 * "exporting" class while capturing.
 */
export async function captureFlow(
  container: HTMLElement,
  bounds: Rect,
  opts: { transparent: boolean; pixelRatio: number },
): Promise<{ canvas: HTMLCanvasElement; w: number; h: number } | null> {
  const el = container.querySelector<HTMLElement>(".react-flow__viewport");
  if (!el) return null;
  const w = Math.ceil(bounds.width + 80);
  const h = Math.ceil(bounds.height + 80);
  const vp = getViewportForBounds(bounds, w, h, 0.2, 2, 0.04);
  await document.fonts.ready;
  fontCss ??= await getFontEmbedCSS(el);
  container.classList.add("exporting");
  try {
    const canvas = await toCanvas(el, {
      fontEmbedCSS: fontCss,
      ...(opts.transparent ? {} : { backgroundColor: "#ffffff" }),
      width: w,
      height: h,
      pixelRatio: opts.pixelRatio,
      style: {
        width: `${w}px`,
        height: `${h}px`,
        transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
      },
      filter: (node) =>
        !(
          node instanceof HTMLElement &&
          (node.classList.contains("no-export") ||
            node.classList.contains("react-flow__resize-control"))
        ),
    });
    return { canvas, w, h };
  } finally {
    container.classList.remove("exporting");
  }
}

export function downloadUrl(href: string, name: string) {
  const a = document.createElement("a");
  a.download = name;
  a.href = href;
  a.click();
}

/** A4 PDF, orientation from the image's shape, centred with 10 mm margins. */
export async function savePdf(
  img: { canvas: HTMLCanvasElement; w: number; h: number },
  title: string,
  fileName: string,
) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    orientation: img.w >= img.h ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const scale = Math.min((pw - 20) / img.w, (ph - 20) / img.h);
  const iw = img.w * scale;
  const ih = img.h * scale;
  pdf.setProperties({ title, creator: "Flowmira" });
  pdf.addImage(
    img.canvas.toDataURL("image/png"),
    "PNG",
    (pw - iw) / 2,
    (ph - ih) / 2,
    iw,
    ih,
    undefined,
    "FAST",
  );
  pdf.save(fileName);
}

export const safeFileName = (title: string) =>
  (title || "diagram").replace(/[^\w-]+/g, "_");
