// ── NEW ── Pictures on the canvas. A picture is stored inside the diagram as a data URL, so
// save, copy/paste, exports and .flowmira backups all carry it with no separate file storage.
import type { SavedItem } from "./types";

/** A picture ready for the canvas. w and h are its pixel size after shrinking. */
export interface ImageAsset {
  src: string;
  w: number;
  h: number;
}

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const IMAGE_ACCEPT = IMAGE_TYPES.join(",");

const MAX_SIDE = 1600;
/** Don't try to decode anything bigger; it can freeze the tab. */
const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** One picture after shrinking. Keeps a single photo from filling a diagram. */
const MAX_IMAGE_CHARS = 2 * 1024 * 1024;
/** A PNG this small stays a PNG, so text in screenshots stays sharp. */
const KEEP_PNG_CHARS = 500_000;
/** nginx's client_max_body_size is 10m; the margin covers the title and JSON around the data. */
export const MAX_DIAGRAM_BYTES = 10 * 1024 * 1024 - 64 * 1024;

/**
 * Only pictures we made ourselves. Anything else (a web address in a hand-edited file, SVG)
 * is dropped when the diagram loads, so opening a diagram can't call out to another site.
 */
export const isImageSrc = (src: unknown): src is string =>
  typeof src === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(src);

const hasTransparency = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  const { data } = ctx.getImageData(0, 0, w, h);
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) return true;
  return false;
};

function encode(bitmap: ImageBitmap, side: number): ImageAsset {
  const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't process pictures.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  const png = canvas.toDataURL("image/png");
  if (png.length <= KEEP_PNG_CHARS) return { src: png, w, h };
  // Photos: much smaller as JPEG. JPEG has no transparency, so those go to WebP
  // (browsers that can't write WebP return PNG here, and the check below keeps it).
  const lossy = canvas.toDataURL(hasTransparency(ctx, w, h) ? "image/webp" : "image/jpeg", 0.85);
  return { src: lossy.length < png.length ? lossy : png, w, h };
}

/** Shrink a file to at most 1600 px on its longest side. Throws a user-facing Error. */
export async function prepareImage(file: File): Promise<ImageAsset> {
  if (!IMAGE_TYPES.includes(file.type))
    throw new Error(`"${file.name}" can't be added. Use a PNG, JPG, WebP or GIF picture.`);
  if (file.size > MAX_FILE_BYTES)
    throw new Error(`"${file.name}" is too large. Use a picture under 25 MB.`);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file); // GIFs give their first frame
  } catch {
    throw new Error(`"${file.name}" couldn't be read. The file may be damaged.`);
  }
  try {
    for (let side = MAX_SIDE; ; side = Math.round(side * 0.75)) {
      const asset = encode(bitmap, side);
      if (asset.src.length <= MAX_IMAGE_CHARS || side < 400) return asset;
    }
  } finally {
    bitmap.close();
  }
}

// Undo keeps 100 copies of the diagram as text. Pictures stay out of those copies, or a
// few megabytes of pictures would hold hundreds of megabytes of memory.
const refBySrc = new Map<string, string>();
const srcByRef = new Map<string, string>();

/** A saved item with its picture swapped for a short reference (for undo history). */
export function stashImage(item: SavedItem): SavedItem {
  if (!item.image) return item;
  let ref = refBySrc.get(item.image);
  if (!ref) {
    ref = `image-${refBySrc.size}`;
    refBySrc.set(item.image, ref);
    srcByRef.set(ref, item.image);
  }
  return { ...item, image: ref };
}

/** Undoes stashImage. */
export function unstashImage(item: SavedItem): SavedItem {
  return item.image ? { ...item, image: srcByRef.get(item.image) } : item;
}
