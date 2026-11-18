import { jsPDF } from 'jspdf';

export interface CropRatios {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ImageSlotState {
  fileName: string;
  originalWidth: number;
  originalHeight: number;
  /** EXIF-corrected data URL stored locally in memory only */
  normalizedDataUrl: string;
  rotationDeg: number;
  cropRatios: CropRatios | null;
}

export type ArrangementMode = 'vertical' | 'horizontal';

const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png']);

export function isSupportedImageFile(file: File): boolean {
  if (SUPPORTED_TYPES.has(file.type.toLowerCase())) {
    return true;
  }
  const lower = file.name.toLowerCase();
  return lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png');
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image.'));
    img.src = src;
  });
}

/**
 * Loads an image file locally and automatically corrects EXIF orientation.
 * Never alters card content or uploads anything externally.
 */
export async function loadAndNormalizeImage(file: File): Promise<ImageSlotState> {
  if (!isSupportedImageFile(file)) {
    throw new Error('Unsupported file format. Please select a JPG, JPEG, or PNG image.');
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to initialize local image canvas.');
  }

  let width = 0;
  let height = 0;

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      width = bitmap.width;
      height = bitmap.height;
      canvas.width = width;
      canvas.height = height;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
    } catch {
      // Fallback for browsers ignoring createImageBitmap options
      const objectUrl = URL.createObjectURL(file);
      try {
        const img = await loadHtmlImage(objectUrl);
        width = img.naturalWidth;
        height = img.naturalHeight;
        canvas.width = width;
        canvas.height = height;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }
  } else {
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await loadHtmlImage(objectUrl);
      width = img.naturalWidth;
      height = img.naturalHeight;
      canvas.width = width;
      canvas.height = height;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  const normalizedDataUrl = canvas.toDataURL('image/jpeg', 0.96);
  canvas.width = 0;
  canvas.height = 0;

  return {
    fileName: file.name,
    originalWidth: width,
    originalHeight: height,
    normalizedDataUrl,
    rotationDeg: 0,
    cropRatios: null,
  };
}

/**
 * Renders the rotated (and optionally cropped) image onto an offscreen canvas
 * while strictly preserving aspect ratio.
 */
export async function renderTransformedImage(
  slot: ImageSlotState,
  includeCrop = true
): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadHtmlImage(slot.normalizedDataUrl);
  const rot = ((slot.rotationDeg % 360) + 360) % 360;
  const swapAxes = rot === 90 || rot === 270;

  const rotatedW = swapAxes ? img.naturalHeight : img.naturalWidth;
  const rotatedH = swapAxes ? img.naturalWidth : img.naturalHeight;

  const rotCanvas = document.createElement('canvas');
  rotCanvas.width = rotatedW;
  rotCanvas.height = rotatedH;
  const rotCtx = rotCanvas.getContext('2d');
  if (!rotCtx) {
    throw new Error('Failed to create image transform context.');
  }

  rotCtx.fillStyle = '#FFFFFF';
  rotCtx.fillRect(0, 0, rotatedW, rotatedH);
  rotCtx.translate(rotatedW / 2, rotatedH / 2);
  rotCtx.rotate((rot * Math.PI) / 180);
  rotCtx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

  if (!includeCrop || !slot.cropRatios) {
    const dataUrl = rotCanvas.toDataURL('image/jpeg', 0.95);
    rotCanvas.width = 0;
    rotCanvas.height = 0;
    return { dataUrl, width: rotatedW, height: rotatedH };
  }

  const { left, top, right, bottom } = slot.cropRatios;
  const sx = Math.max(0, Math.round(left * rotatedW));
  const sy = Math.max(0, Math.round(top * rotatedH));
  const sw = Math.max(10, Math.round((right - left) * rotatedW));
  const sh = Math.max(10, Math.round((bottom - top) * rotatedH));

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = sw;
  cropCanvas.height = sh;
  const cropCtx = cropCanvas.getContext('2d');
  if (!cropCtx) {
    rotCanvas.width = 0;
    rotCanvas.height = 0;
    throw new Error('Failed to create image crop context.');
  }

  cropCtx.drawImage(rotCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  const dataUrl = cropCanvas.toDataURL('image/jpeg', 0.95);

  rotCanvas.width = 0;
  rotCanvas.height = 0;
  cropCanvas.width = 0;
  cropCanvas.height = 0;

  return { dataUrl, width: sw, height: sh };
}

export function buildTimestampFilename(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `CNIC_Copy_${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}.pdf`;
}

/**
 * Generates a single A4 PDF containing Front and Back CNIC images
 * arranged vertically or horizontally with preserved aspect ratio.
 */
export async function generateCnicA4Pdf(
  frontSlot: ImageSlotState,
  backSlot: ImageSlotState,
  arrangement: ArrangementMode
): Promise<{ blob: Blob; filename: string }> {
  const [frontRendered, backRendered] = await Promise.all([
    renderTransformedImage(frontSlot, true),
    renderTransformedImage(backSlot, true),
  ]);

  // A4 in mm: 210 x 297
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  pdf.setProperties({
    title: 'CNIC Copy',
    creator: 'CNIC Copy Maker',
  });

  const pageW = 210;
  const pageH = 297;
  const margin = 12;
  const gap = 8;

  const slots =
    arrangement === 'vertical'
      ? (() => {
          const slotW = pageW - 2 * margin;
          const slotH = (pageH - 2 * margin - gap) / 2;
          return [
            { x: margin, y: margin, w: slotW, h: slotH },
            { x: margin, y: margin + slotH + gap, w: slotW, h: slotH },
          ];
        })()
      : (() => {
          const slotW = (pageW - 2 * margin - gap) / 2;
          const slotH = pageH - 2 * margin;
          return [
            { x: margin, y: margin, w: slotW, h: slotH },
            { x: margin + slotW + gap, y: margin, w: slotW, h: slotH },
          ];
        })();

  const items = [frontRendered, backRendered];
  items.forEach((item, idx) => {
    const slot = slots[idx];
    const scale = Math.min(slot.w / item.width, slot.h / item.height);
    const drawW = item.width * scale;
    const drawH = item.height * scale;
    const drawX = slot.x + (slot.w - drawW) / 2;
    const drawY = slot.y + (slot.h - drawH) / 2;

    pdf.addImage(item.dataUrl, 'JPEG', drawX, drawY, drawW, drawH, undefined, 'FAST');
  });

  const blob = pdf.output('blob');
  const filename = buildTimestampFilename();
  return { blob, filename };
}
