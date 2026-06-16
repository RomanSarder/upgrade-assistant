import { useRef, useState } from "react";
import { Card, Wordmark } from "../shared/ui";
import { BudgetMeter } from "./BudgetMeter";
import type { Budget } from "./types";

interface Props {
  onSubmit: (formData: FormData) => void;
  budget: Budget | null;
}

export function AnalysisForm({ onSubmit, budget }: Props) {
  const [pasteText, setPasteText] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePasteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPasteText(e.target.value);
    setUploadedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadedFile(e.target.files?.[0] ?? null);
    setPasteText("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    if (uploadedFile) {
      fd.append("file", new File([uploadedFile], uploadedFile.name, { type: "application/json" }));
    } else {
      fd.append("file", new File([pasteText], "package.json", { type: "application/json" }));
    }
    onSubmit(fd);
  };

  return (
    <Card>
      <Wordmark />
      <div className="px-8 pt-5 pb-8">
        <div className="animate-fade-up">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-0.5">
              <h1 className="text-lg font-semibold text-gray-900 tracking-[-0.02em]">
                Analyse packages
              </h1>
            </div>
            <label htmlFor="pkg-input" className="sr-only">Package JSON contents</label>
            <textarea
              id="pkg-input"
              rows={12}
              value={pasteText}
              onChange={handlePasteChange}
              placeholder="Paste package.json contents here…"
              className="w-full rounded-lg border border-gray-300 bg-gray-50/60 px-3.5 py-3 text-sm font-mono text-gray-900 placeholder-gray-400 outline-none resize-none transition-all duration-150 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/10"
            />
            <div className="relative flex items-center gap-3" aria-hidden="true">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs text-gray-500 uppercase tracking-wide">or</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>
            <label htmlFor="pkg-file" className="sr-only">Upload package.json file</label>
            <input
              ref={fileInputRef}
              id="pkg-file"
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-gray-700 hover:file:bg-gray-200 transition-all duration-150"
            />
            <button
              type="submit"
              disabled={!pasteText.trim() && !uploadedFile}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-all duration-150 hover:bg-indigo-700 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Analyse
            </button>
          </form>
          {budget && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <BudgetMeter limit={budget.limit} used={budget.used} />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
