import { useCallback, useEffect, useState } from 'react';
import JSZip from 'jszip';
import { Download, Eye, FolderOpen, RotateCcw } from 'lucide-react';
import { CropModal } from './components/CropModal';
import { DESKTOP_FILES, DesktopPackageView } from './components/DesktopPackageView';
import { ImageSlotCard } from './components/ImageSlotCard';
import { PdfPreviewModal } from './components/PdfPreviewModal';
import {
  ArrangementMode,
  CropRatios,
  ImageSlotState,
  generateCnicA4Pdf,
} from './utils/imageProcessing';

type WorkspaceTab = 'maker' | 'desktop';

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('maker');
  const [frontSlot, setFrontSlot] = useState<ImageSlotState | null>(null);
  const [backSlot, setBackSlot] = useState<ImageSlotState | null>(null);
  const [arrangement, setArrangement] = useState<ArrangementMode>('vertical');
  const [cropTarget, setCropTarget] = useState<'front' | 'back' | null>(null);

  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [outputFolderLabel, setOutputFolderLabel] = useState<string>('Browser Downloads');
  const [statusMessage, setStatusMessage] = useState<string>(
    'Ready — upload front and back CNIC images'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  const [lastPdf, setLastPdf] = useState<{
    url: string;
    blob: Blob;
    filename: string;
  } | null>(null);
  const [showPdfPreview, setShowPdfPreview] = useState<boolean>(false);

  useEffect(() => {
    return () => {
      if (lastPdf?.url) {
        URL.revokeObjectURL(lastPdf.url);
      }
    };
  }, [lastPdf]);

  const handleSlotError = useCallback((msg: string) => {
    setErrorMessage(msg);
  }, []);

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSelectFolder = async () => {
    setErrorMessage(null);
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) {
      setStatusMessage('Using Browser Downloads (folder picker requires standalone desktop or Chromium top-level window)');
      return;
    }
    try {
      const handle = await picker({ mode: 'readwrite' });
      setDirHandle(handle);
      setOutputFolderLabel(handle.name);
      setStatusMessage(`Output folder set: ${handle.name}`);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setStatusMessage('Using Browser Downloads folder for PDF output');
    }
  };

  const handleGeneratePdf = async () => {
    if (!frontSlot || !backSlot) return;
    setErrorMessage(null);
    setIsGenerating(true);

    try {
      const { blob, filename } = await generateCnicA4Pdf(frontSlot, backSlot, arrangement);

      if (lastPdf?.url) {
        URL.revokeObjectURL(lastPdf.url);
      }
      const pdfUrl = URL.createObjectURL(blob);
      setLastPdf({ url: pdfUrl, blob, filename });

      let savedToFolder = false;
      if (dirHandle) {
        try {
          const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          savedToFolder = true;
          setStatusMessage(`Saved to ${dirHandle.name}/${filename}`);
        } catch {
          savedToFolder = false;
        }
      }

      if (!savedToFolder) {
        triggerDownload(blob, filename);
        setStatusMessage(`Generated: ${filename}`);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'PDF generation failed.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReset = () => {
    if (lastPdf?.url) {
      URL.revokeObjectURL(lastPdf.url);
    }
    setFrontSlot(null);
    setBackSlot(null);
    setLastPdf(null);
    setShowPdfPreview(false);
    setErrorMessage(null);
    setStatusMessage('Ready — upload front and back CNIC images');
  };

  const handleDownloadBundle = async () => {
    const zip = new JSZip();
    const folder = zip.folder('CNIC_Copy_Maker_Desktop');
    if (!folder) return;
    DESKTOP_FILES.forEach((file) => {
      folder.file(file.name, file.content);
    });
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    triggerDownload(zipBlob, 'CNIC_Copy_Maker_Desktop_Source.zip');
  };

  const handleApplyCrop = (ratios: CropRatios | null) => {
    if (cropTarget === 'front' && frontSlot) {
      setFrontSlot({ ...frontSlot, cropRatios: ratios });
    } else if (cropTarget === 'back' && backSlot) {
      setBackSlot({ ...backSlot, cropRatios: ratios });
    }
    setCropTarget(null);
  };

  const activeCropSlot =
    cropTarget === 'front' ? frontSlot : cropTarget === 'back' ? backSlot : null;

  return (
    <div className="min-h-screen bg-[#070D19] text-[#F8FAFC]">
      {/* 3-Zone Top Bar */}
      <header className="border-b border-[#1E2E4D] bg-[#0A1120]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-8 px-6 py-3.5">
          <span className="text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0">
            CNIC Copy Maker
          </span>

          <nav className="flex items-center gap-6 text-xs font-medium" aria-label="Primary">
            <button
              type="button"
              onClick={() => setActiveTab('maker')}
              className={`border-b-2 py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'maker'
                  ? 'border-[#3B82F6] text-white'
                  : 'border-transparent text-[#94A3B8] hover:text-white'
              }`}
            >
              A4 PDF Maker
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('desktop')}
              className={`border-b-2 py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'desktop'
                  ? 'border-[#3B82F6] text-white'
                  : 'border-transparent text-[#94A3B8] hover:text-white'
              }`}
            >
              Windows Desktop Source & EXE
            </button>
          </nav>

          <button
            type="button"
            onClick={handleDownloadBundle}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#23375E] bg-[#13203B] px-3.5 py-1.5 text-xs font-medium text-[#F1F5F9] hover:border-[#3B82F6] hover:bg-[#1B2D52] whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Download Desktop Source (.zip)
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-5">
        {activeTab === 'maker' ? (
          <div className="space-y-4">
            {/* Compact Status Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-[#94A3B8]">
                Offline local processing · Single A4 output · Original aspect ratio preserved
              </p>
              <p className="font-mono text-xs text-[#CBD5E1] tabular-nums">{statusMessage}</p>
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="rounded-md border border-red-800/70 bg-red-950/50 px-3.5 py-2 text-xs text-red-200"
              >
                {errorMessage}
              </div>
            )}

            {/* Two Image Preview Panels: FRONT and BACK */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <ImageSlotCard
                title="FRONT"
                slot={frontSlot}
                onChange={(next) => {
                  setErrorMessage(null);
                  setFrontSlot(next);
                }}
                onOpenCrop={() => setCropTarget('front')}
                onError={handleSlotError}
              />
              <ImageSlotCard
                title="BACK"
                slot={backSlot}
                onChange={(next) => {
                  setErrorMessage(null);
                  setBackSlot(next);
                }}
                onOpenCrop={() => setCropTarget('back')}
                onError={handleSlotError}
              />
            </div>

            {/* Arrangement & Output Folder Control Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#1E2E4D] bg-[#0D1629] px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-semibold text-[#CBD5E1]">A4 Arrangement:</span>
                <div className="inline-flex rounded-md border border-[#1E2E4D] bg-[#08101F] p-0.5">
                  <button
                    type="button"
                    onClick={() => setArrangement('vertical')}
                    className={`rounded px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      arrangement === 'vertical'
                        ? 'bg-[#2563EB] text-white'
                        : 'text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    Vertical (Stacked)
                  </button>
                  <button
                    type="button"
                    onClick={() => setArrangement('horizontal')}
                    className={`rounded px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      arrangement === 'horizontal'
                        ? 'bg-[#2563EB] text-white'
                        : 'text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    Horizontal (Side-by-Side)
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-xs font-semibold text-[#CBD5E1]">Output Folder:</span>
                <span className="font-mono text-xs text-[#94A3B8]">{outputFolderLabel}</span>
                <button
                  type="button"
                  onClick={handleSelectFolder}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#23375E] bg-[#13203B] px-3 py-1.5 text-xs font-medium text-[#F1F5F9] hover:border-[#3B82F6] hover:bg-[#1B2D52] whitespace-nowrap shrink-0"
                >
                  <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  Select Folder
                </button>
              </div>
            </div>

            {/* Bottom Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!lastPdf}
                  onClick={() => setShowPdfPreview(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#23375E] bg-[#13203B] px-3.5 py-2 text-xs font-medium text-[#F1F5F9] hover:border-[#3B82F6] hover:bg-[#1B2D52] disabled:cursor-not-allowed disabled:border-[#16223A] disabled:bg-[#0B1324] disabled:text-[#475569] whitespace-nowrap shrink-0"
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  Open PDF
                </button>

                <button
                  type="button"
                  disabled={!lastPdf}
                  onClick={() => lastPdf && triggerDownload(lastPdf.blob, lastPdf.filename)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#23375E] bg-[#13203B] px-3.5 py-2 text-xs font-medium text-[#F1F5F9] hover:border-[#3B82F6] hover:bg-[#1B2D52] disabled:cursor-not-allowed disabled:border-[#16223A] disabled:bg-[#0B1324] disabled:text-[#475569] whitespace-nowrap shrink-0"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Save Copy
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#23375E] bg-[#13203B] px-3.5 py-2 text-xs font-medium text-[#F1F5F9] hover:border-[#3B82F6] hover:bg-[#1B2D52] whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Reset
                </button>
              </div>

              <button
                type="button"
                disabled={!frontSlot || !backSlot || isGenerating}
                onClick={handleGeneratePdf}
                className="rounded-md border border-[#3B82F6] bg-[#2563EB] px-6 py-2.5 text-sm font-bold tracking-wide text-white hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:border-[#1E2E4D] disabled:bg-[#172544] disabled:text-[#64748B] whitespace-nowrap shrink-0"
              >
                {isGenerating ? 'GENERATING PDF...' : 'GENERATE PDF'}
              </button>
            </div>
          </div>
        ) : (
          <DesktopPackageView onDownloadBundle={handleDownloadBundle} />
        )}
      </main>

      {cropTarget && activeCropSlot && (
        <CropModal
          slotLabel={cropTarget === 'front' ? 'Front' : 'Back'}
          slot={activeCropSlot}
          onApply={handleApplyCrop}
          onClose={() => setCropTarget(null)}
        />
      )}

      {showPdfPreview && lastPdf && (
        <PdfPreviewModal
          pdfUrl={lastPdf.url}
          filename={lastPdf.filename}
          onDownload={() => triggerDownload(lastPdf.blob, lastPdf.filename)}
          onClose={() => setShowPdfPreview(false)}
        />
      )}
    </div>
  );
}
