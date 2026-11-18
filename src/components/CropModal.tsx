import React, { useEffect, useRef, useState } from 'react';
import { CropRatios, ImageSlotState, renderTransformedImage } from '../utils/imageProcessing';

interface CropModalProps {
  slotLabel: string;
  slot: ImageSlotState;
  onApply: (ratios: CropRatios | null) => void;
  onClose: () => void;
}

interface Point {
  x: number;
  y: number;
}

export const CropModal: React.FC<CropModalProps> = ({
  slotLabel,
  slot,
  onApply,
  onClose,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [startPt, setStartPt] = useState<Point | null>(null);
  const [currentPt, setCurrentPt] = useState<Point | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    let active = true;
    renderTransformedImage(slot, false)
      .then((res) => {
        if (active) setPreviewUrl(res.dataUrl);
      })
      .catch(() => {
        if (active) setErrorMsg('Could not prepare image for cropping.');
      });
    return () => {
      active = false;
    };
  }, [slot]);

  const getRelativePoint = (clientX: number, clientY: number): Point | null => {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(clientY - rect.top, rect.height));
    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const pt = getRelativePoint(e.clientX, e.clientY);
    if (!pt) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    setStartPt(pt);
    setCurrentPt(pt);
    setErrorMsg(null);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const pt = getRelativePoint(e.clientX, e.clientY);
    if (pt) setCurrentPt(pt);
  };

  const handlePointerUp = () => {
    setDragging(false);
  };

  const selectionRect =
    startPt && currentPt
      ? {
          left: Math.min(startPt.x, currentPt.x),
          top: Math.min(startPt.y, currentPt.y),
          width: Math.abs(currentPt.x - startPt.x),
          height: Math.abs(currentPt.y - startPt.y),
        }
      : null;

  const handleApply = () => {
    const img = imgRef.current;
    if (!img || !selectionRect || selectionRect.width < 12 || selectionRect.height < 12) {
      setErrorMsg('Drag a rectangle over the card edges before applying.');
      return;
    }
    const rect = img.getBoundingClientRect();
    onApply({
      left: Math.max(0, Math.min(1, selectionRect.left / rect.width)),
      top: Math.max(0, Math.min(1, selectionRect.top / rect.height)),
      right: Math.max(0, Math.min(1, (selectionRect.left + selectionRect.width) / rect.width)),
      bottom: Math.max(0, Math.min(1, (selectionRect.top + selectionRect.height) / rect.height)),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Crop ${slotLabel} Image`}
    >
      <div className="w-full max-w-3xl rounded-lg border border-[#1E2E4D] bg-[#0D1629] p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white">Crop {slotLabel} Image</h2>
            <p className="text-xs text-[#94A3B8]">
              Drag across the image to mark the CNIC card boundaries.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[#23375E] bg-[#13203B] px-3 py-1.5 text-xs font-medium text-[#E2E8F0] hover:border-[#3B82F6] hover:bg-[#1B2D52] whitespace-nowrap shrink-0"
          >
            Close
          </button>
        </div>

        <div className="flex min-h-[340px] items-center justify-center rounded-md border border-[#1E2E4D] bg-[#050A14] p-3">
          {previewUrl ? (
            <div
              className="relative inline-block cursor-crosshair select-none touch-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              <img
                ref={imgRef}
                src={previewUrl}
                alt={`Crop ${slotLabel}`}
                draggable={false}
                className="max-h-[420px] max-w-full object-contain"
              />
              {selectionRect && selectionRect.width > 2 && selectionRect.height > 2 && (
                <div
                  className="pointer-events-none absolute border-2 border-[#3B82F6] bg-[#2563EB]/20"
                  style={{
                    left: `${selectionRect.left}px`,
                    top: `${selectionRect.top}px`,
                    width: `${selectionRect.width}px`,
                    height: `${selectionRect.height}px`,
                  }}
                />
              )}
            </div>
          ) : (
            <span className="text-xs text-[#94A3B8]">Preparing image...</span>
          )}
        </div>

        {errorMsg && (
          <p className="mt-2 text-xs text-amber-400" role="alert">
            {errorMsg}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onApply(null)}
            className="rounded-md border border-[#23375E] bg-[#13203B] px-3.5 py-2 text-xs font-medium text-[#E2E8F0] hover:border-[#3B82F6] hover:bg-[#1B2D52] whitespace-nowrap shrink-0"
          >
            Reset Crop
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-[#23375E] bg-[#13203B] px-4 py-2 text-xs font-medium text-[#E2E8F0] hover:border-[#3B82F6] hover:bg-[#1B2D52] whitespace-nowrap shrink-0"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="rounded-md border border-[#3B82F6] bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8] whitespace-nowrap shrink-0"
            >
              Apply Crop
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
