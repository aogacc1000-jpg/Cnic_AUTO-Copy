import React, { useEffect, useRef, useState } from 'react';
import { Crop, RotateCcw, RotateCw, Trash2, Upload } from 'lucide-react';
import {
  CropRatios,
  ImageSlotState,
  loadAndNormalizeImage,
  renderTransformedImage,
} from '../utils/imageProcessing';

interface ImageSlotCardProps {
  title: 'FRONT' | 'BACK';
  slot: ImageSlotState | null;
  onChange: (next: ImageSlotState | null) => void;
  onOpenCrop: () => void;
  onError: (message: string) => void;
}

export const ImageSlotCard: React.FC<ImageSlotCardProps> = ({
  title,
  slot,
  onChange,
  onOpenCrop,
  onError,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<{
    dataUrl: string;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (!slot) {
      setPreview(null);
      return;
    }
    let active = true;
    renderTransformedImage(slot, true)
      .then((res) => {
        if (active) setPreview(res);
      })
      .catch(() => {
        if (active) onError(`Failed to render ${title} preview.`);
      });
    return () => {
      active = false;
    };
  }, [slot, title, onError]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const normalized = await loadAndNormalizeImage(file);
      onChange(normalized);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to load image.');
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    void handleFile(file);
  };

  const handleRotate = (delta: number) => {
    if (!slot) return;
    onChange({
      ...slot,
      rotationDeg: ((slot.rotationDeg + delta) % 360 + 360) % 360,
      cropRatios: null as CropRatios | null,
    });
  };

  return (
    <section
      aria-label={`${title} CNIC panel`}
      onDragEnter={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragActive(false);
      }}
      onDrop={handleDrop}
      className="flex flex-col rounded-lg border border-[#1E2E4D] bg-[#0D1629] p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-wider text-[#93C5FD]">
          {title}
        </h2>
        <span className="truncate font-mono text-xs text-[#94A3B8] tabular-nums">
          {slot && preview
            ? `${slot.fileName} (${preview.width}×${preview.height})${
                slot.rotationDeg ? ` · ${slot.rotationDeg}°` : ''
              }${slot.cropRatios ? ' · Cropped' : ''}`
            : 'No image selected'}
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,image/jpeg,image/png"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          void handleFile(file);
          e.target.value = '';
        }}
      />

      <div
        onClick={() => {
          if (!slot) inputRef.current?.click();
        }}
        className={`flex h-64 w-full items-center justify-center overflow-hidden rounded-md p-2 transition-colors ${
          dragActive
            ? 'border-2 border-dashed border-[#3B82F6] bg-[#0F1D36]'
            : slot
              ? 'border border-[#254375] bg-[#08101F]'
              : 'cursor-pointer border border-dashed border-[#2A3F66] bg-[#08101F] hover:border-[#3B82F6]'
        }`}
      >
        {preview ? (
          <img
            src={preview.dataUrl}
            alt={`${title} CNIC preview`}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <Upload className="h-6 w-6 text-[#64748B]" aria-hidden="true" />
            <p className="text-xs font-medium text-[#CBD5E1]">
              Drop JPG / PNG here or click Upload
            </p>
            <p className="text-[11px] text-[#64748B]">
              EXIF orientation corrected automatically
            </p>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#23375E] bg-[#13203B] px-3 py-1.5 text-xs font-medium text-[#F1F5F9] hover:border-[#3B82F6] hover:bg-[#1B2D52] whitespace-nowrap shrink-0"
        >
          <Upload className="h-3.5 w-3.5" aria-hidden="true" />
          Upload
        </button>

        <button
          type="button"
          disabled={!slot}
          onClick={() => handleRotate(-90)}
          className="inline-flex items-center gap-1 rounded-md border border-[#23375E] bg-[#13203B] px-2.5 py-1.5 text-xs font-medium text-[#F1F5F9] hover:border-[#3B82F6] hover:bg-[#1B2D52] disabled:cursor-not-allowed disabled:border-[#16223A] disabled:bg-[#0B1324] disabled:text-[#475569] whitespace-nowrap shrink-0"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          -90°
        </button>

        <button
          type="button"
          disabled={!slot}
          onClick={() => handleRotate(90)}
          className="inline-flex items-center gap-1 rounded-md border border-[#23375E] bg-[#13203B] px-2.5 py-1.5 text-xs font-medium text-[#F1F5F9] hover:border-[#3B82F6] hover:bg-[#1B2D52] disabled:cursor-not-allowed disabled:border-[#16223A] disabled:bg-[#0B1324] disabled:text-[#475569] whitespace-nowrap shrink-0"
        >
          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          +90°
        </button>

        <button
          type="button"
          disabled={!slot}
          onClick={onOpenCrop}
          className="inline-flex items-center gap-1 rounded-md border border-[#23375E] bg-[#13203B] px-2.5 py-1.5 text-xs font-medium text-[#F1F5F9] hover:border-[#3B82F6] hover:bg-[#1B2D52] disabled:cursor-not-allowed disabled:border-[#16223A] disabled:bg-[#0B1324] disabled:text-[#475569] whitespace-nowrap shrink-0"
        >
          <Crop className="h-3.5 w-3.5" aria-hidden="true" />
          Crop
        </button>

        <button
          type="button"
          disabled={!slot}
          onClick={() => onChange(null)}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-[#23375E] bg-[#13203B] px-2.5 py-1.5 text-xs font-medium text-[#CBD5E1] hover:border-[#3B82F6] hover:bg-[#1B2D52] disabled:cursor-not-allowed disabled:border-[#16223A] disabled:bg-[#0B1324] disabled:text-[#475569] whitespace-nowrap shrink-0"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Clear
        </button>
      </div>
    </section>
  );
};
