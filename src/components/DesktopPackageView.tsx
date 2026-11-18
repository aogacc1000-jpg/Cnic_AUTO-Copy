import React, { useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import pySource from '../../desktop_app/cnic_copy_maker.py?raw';
import reqText from '../../desktop_app/requirements.txt?raw';
import buildBat from '../../desktop_app/build_exe.bat?raw';
import readmeMd from '../../desktop_app/README.md?raw';

interface DesktopFileItem {
  id: string;
  name: string;
  summary: string;
  content: string;
}

export const DESKTOP_FILES: DesktopFileItem[] = [
  {
    id: 'py',
    name: 'cnic_copy_maker.py',
    summary: 'PySide6 + Pillow + ReportLab offline Windows desktop application',
    content: pySource,
  },
  {
    id: 'req',
    name: 'requirements.txt',
    summary: 'Pinned Python dependencies (PySide6, Pillow, ReportLab, PyInstaller)',
    content: reqText,
  },
  {
    id: 'bat',
    name: 'build_exe.bat',
    summary: 'One-click Windows batch script to package CNIC Copy Maker.exe',
    content: buildBat,
  },
  {
    id: 'readme',
    name: 'README.md',
    summary: 'Offline setup and Windows EXE packaging instructions',
    content: readmeMd,
  },
];

interface DesktopPackageViewProps {
  onDownloadBundle: () => void;
}

export const DesktopPackageView: React.FC<DesktopPackageViewProps> = ({
  onDownloadBundle,
}) => {
  const [activeId, setActiveId] = useState<string>('py');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const activeFile = DESKTOP_FILES.find((f) => f.id === activeId) ?? DESKTOP_FILES[0];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeFile.content);
      setCopiedId(activeFile.id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Clipboard restricted in iframe fallback
    }
  };

  const handleDownloadSingle = () => {
    const blob = new Blob([activeFile.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#1E2E4D] bg-[#0D1629] p-4">
        <div>
          <h2 className="text-sm font-semibold text-white">
            Windows Desktop Package (Python + PySide6 + Pillow + ReportLab)
          </h2>
          <p className="mt-0.5 text-xs text-[#94A3B8]">
            Extract the bundle on Windows and run <code className="text-[#93C5FD]">build_exe.bat</code> to compile <code className="text-[#93C5FD]">CNIC Copy Maker.exe</code>.
          </p>
        </div>
        <button
          type="button"
          onClick={onDownloadBundle}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#3B82F6] bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1D4ED8] whitespace-nowrap shrink-0"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Download All Files (.zip)
        </button>
      </div>

      <div className="rounded-lg border border-[#1E2E4D] bg-[#0D1629] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-[#1E2E4D] pb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {DESKTOP_FILES.map((file) => {
              const active = file.id === activeFile.id;
              return (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => setActiveId(file.id)}
                  className={`rounded-md px-3 py-1.5 font-mono text-xs transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'border border-[#3B82F6] bg-[#17294A] text-white'
                      : 'border border-transparent bg-[#08101F] text-[#94A3B8] hover:border-[#23375E] hover:text-white'
                  }`}
                >
                  {file.name}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#23375E] bg-[#13203B] px-3 py-1.5 text-xs font-medium text-[#F1F5F9] hover:border-[#3B82F6] hover:bg-[#1B2D52] whitespace-nowrap shrink-0"
            >
              {copiedId === activeFile.id ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {copiedId === activeFile.id ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={handleDownloadSingle}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#23375E] bg-[#13203B] px-3 py-1.5 text-xs font-medium text-[#F1F5F9] hover:border-[#3B82F6] hover:bg-[#1B2D52] whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Download File
            </button>
          </div>
        </div>

        <p className="mb-2 text-xs text-[#94A3B8]">{activeFile.summary}</p>
        <pre className="max-h-[420px] overflow-auto rounded-md border border-[#1E2E4D] bg-[#060B16] p-4 font-mono text-xs leading-relaxed text-[#E2E8F0]">
          <code>{activeFile.content}</code>
        </pre>
      </div>
    </div>
  );
};
