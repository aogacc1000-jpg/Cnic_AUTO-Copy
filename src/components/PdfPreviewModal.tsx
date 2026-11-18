import React from 'react';
import { Download, X } from 'lucide-react';

interface PdfPreviewModalProps {
  pdfUrl: string;
  filename: string;
  onDownload: () => void;
  onClose: () => void;
}

export const PdfPreviewModal: React.FC<PdfPreviewModalProps> = ({
  pdfUrl,
  filename,
  onDownload,
  onClose,
}) => {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Generated PDF Preview"
    >
      <div className="flex h-[88vh] w-full max-w-4xl flex-col rounded-lg border border-[#1E2E4D] bg-[#0D1629] p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-white">{filename}</h2>
            <p className="text-xs text-[#94A3B8]">Single A4 Page · Generated Locally</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onDownload}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#3B82F6] bg-[#2563EB] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#1D4ED8] whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Save PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1 rounded-md border border-[#23375E] bg-[#13203B] px-3 py-1.5 text-xs font-medium text-[#E2E8F0] hover:border-[#3B82F6] hover:bg-[#1B2D52] whitespace-nowrap shrink-0"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Close
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden rounded-md border border-[#1E2E4D] bg-[#050A14]">
          <iframe
            src={pdfUrl}
            title={filename}
            className="h-full w-full border-0"
          />
        </div>
      </div>
    </div>
  );
};
