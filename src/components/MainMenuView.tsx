import React, { useRef } from 'react';
import { AlertCircle, ArrowRight, Upload } from 'lucide-react';

interface MainMenuViewProps {
  onStart: () => void;
  onUploadFiles: (files: FileList) => void;
  uploadError: string | null;
  onDismissError: () => void;
}

export const MainMenuView: React.FC<MainMenuViewProps> = ({
  onStart,
  onUploadFiles,
  uploadError,
  onDismissError,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUploadFiles(e.target.files);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      <header className="w-full border-b border-slate-200/80 bg-white/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between gap-8">
          <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            Cadence
          </span>
          <span className="text-xs font-medium text-slate-500 whitespace-nowrap shrink-0">
            Client-Side Arithmetic Lab
          </span>
        </div>
      </header>

      <main className="flex-1 flex items-center">
        <div className="max-w-5xl w-full mx-auto px-6 py-12 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            <div className="lg:col-span-7 space-y-8">
              <div className="space-y-4">
                <p className="text-xs font-medium text-[#0284C7] tracking-wide">
                  Zero-latency drills · Voice &amp; handwriting · Local CSV analytics
                </p>
                <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 leading-[1.1] [text-wrap:balance]">
                  Mental arithmetic, measured cleanly.
                </h1>
                <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
                  Train recall speed and accuracy with timed runs using keyboard entry or hands-free voice read-aloud and finger handwriting. Export every equation to CSV or upload past logs to pinpoint weak spots.
                </p>
              </div>

              {uploadError && (
                <div
                  role="alert"
                  className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 flex items-start gap-3"
                >
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="flex-1 text-sm leading-relaxed">
                    <p className="font-semibold">Upload rejected</p>
                    <p className="mt-0.5 text-red-800">{uploadError}</p>
                  </div>
                  <button
                    type="button"
                    onClick={onDismissError}
                    className="min-h-[36px] px-2.5 text-xs font-medium text-red-700 hover:text-red-900 underline underline-offset-2 shrink-0"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 pt-2">
                <button
                  type="button"
                  onClick={onStart}
                  className="min-h-[52px] px-7 py-3.5 rounded-xl bg-[#0F172A] text-white text-base font-semibold hover:bg-slate-800 active:scale-[0.99] transition-all inline-flex items-center justify-center gap-2.5 whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0284C7]"
                >
                  <span>Start</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handleUploadClick}
                  className="min-h-[52px] px-7 py-3.5 rounded-xl bg-white text-slate-900 border border-slate-300 text-base font-semibold hover:bg-slate-50 hover:border-slate-400 active:scale-[0.99] transition-all inline-flex items-center justify-center gap-2.5 whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0284C7]"
                >
                  <Upload className="w-4 h-4 text-slate-600" />
                  <span>Upload</span>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                  aria-label="Upload past math session CSV files"
                />
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-6">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold text-slate-900">
                    Session Workflow
                  </h2>
                  <p className="text-xs text-slate-500">
                    100% browser-executed with zero stored cookies or databases
                  </p>
                </div>

                <div className="divide-y divide-slate-100">
                  <div className="py-3.5 first:pt-0 flex items-baseline justify-between gap-4">
                    <span className="text-sm font-medium text-slate-800">
                      01. Multiplication &amp; Mixed Modes
                    </span>
                    <span className="text-xs font-mono-tabular text-slate-500 shrink-0">
                      + · − · × · ÷
                    </span>
                  </div>
                  <div className="py-3.5 flex items-baseline justify-between gap-4">
                    <span className="text-sm font-medium text-slate-800">
                      02. Hands-Free Handwriting
                    </span>
                    <span className="text-xs font-mono-tabular text-slate-500 shrink-0">
                      Speech + OCR
                    </span>
                  </div>
                  <div className="py-3.5 flex items-baseline justify-between gap-4">
                    <span className="text-sm font-medium text-slate-800">
                      03. Zero-Distraction Flow
                    </span>
                    <span className="text-xs font-mono-tabular text-slate-500 shrink-0">
                      ms Precision
                    </span>
                  </div>
                  <div className="py-3.5 last:pb-0 flex items-baseline justify-between gap-4">
                    <span className="text-sm font-medium text-slate-800">
                      04. Multi-CSV Analytics
                    </span>
                    <span className="text-xs font-mono-tabular text-slate-500 shrink-0">
                      PNG Export
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
