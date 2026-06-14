import { useState, useRef } from "react";
import { Loader2 } from "lucide-react";
import { apiClient, ApiError } from "../shared/api";
import { DotBackground, Card } from "../shared/ui";
import type { PackageResult } from "@upgrade-advisor/shared";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PageState = "idle" | "loading" | "results" | "error";

function TypeBadge({ isDev }: { isDev: boolean }) {
  return isDev ? (
    <Badge variant="secondary">devDep</Badge>
  ) : (
    <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
      dep
    </Badge>
  );
}

function StatusBadge({ upgradeAvailable }: { upgradeAvailable: boolean }) {
  return upgradeAvailable ? (
    <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">
      Upgrade available
    </Badge>
  ) : (
    <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
      Up to date
    </Badge>
  );
}

function MonoCell({ className, children }: { className?: string; children: React.ReactNode }) {
  return <TableCell className={`font-mono text-[13px] ${className ?? ""}`}>{children}</TableCell>;
}

function ResultsTable({ results }: { results: PackageResult[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Package</TableHead>
          <TableHead>Current</TableHead>
          <TableHead>Latest</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {results.map((pkg) => (
          <TableRow
            key={pkg.name}
            className={pkg.upgradeAvailable ? "bg-amber-50/60" : ""}
          >
            <MonoCell className="font-medium">{pkg.name}</MonoCell>
            <MonoCell className="text-gray-600">{pkg.currentVersion}</MonoCell>
            <MonoCell className="text-gray-600">{pkg.latestVersion ?? "—"}</MonoCell>
            <TableCell><TypeBadge isDev={pkg.isDev} /></TableCell>
            <TableCell><StatusBadge upgradeAvailable={pkg.upgradeAvailable} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function AnalysisPage() {
  const [pageState, setPageState] = useState<PageState>("idle");
  const [pasteText, setPasteText] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [results, setResults] = useState<PackageResult[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
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

  const buildFormData = () => {
    const fd = new FormData();
    if (uploadedFile) {
      fd.append("file", new File([uploadedFile], uploadedFile.name, { type: "application/json" }));
    } else {
      fd.append("file", new File([pasteText], "package.json", { type: "application/json" }));
    }
    return fd;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPageState("loading");
    setErrorMessage("");
    try {
      const data = await apiClient<PackageResult[]>("/packages/analyse", {
        method: "POST",
        body: buildFormData(),
      });
      if (data === null) throw new Error("Invalid response from server");
      setResults(data);
      setPageState("results");
    } catch (err) {
      setPageState("error");
      setErrorMessage(
        err instanceof ApiError && err.message
          ? err.message
          : "Something went wrong. Please try again."
      );
    }
  };

  const reset = () => {
    setPageState("idle");
    setPasteText("");
    setUploadedFile(null);
    setErrorMessage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (pageState === "results") {
    return (
      <div className="min-h-screen">
        <DotBackground />
        <div className="max-w-5xl mx-auto px-8 py-8 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Results</h1>
            <button
              onClick={reset}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] font-medium text-gray-700 transition-all duration-150 hover:bg-gray-50 hover:border-gray-300 active:scale-[0.99]"
            >
              Analyse another
            </button>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <ResultsTable results={results} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <DotBackground />
      <div className="w-full max-w-2xl">
        <Card>
          <div className="px-8 pt-7 pb-0">
            <span className="font-mono text-[11px] tracking-[0.18em] text-gray-400 uppercase select-none">
              upgrade-advisor
            </span>
          </div>
          <div className="px-8 pt-5 pb-8">
            {pageState === "loading" && (
              <div className="animate-fade-up flex flex-col items-center gap-4 py-12">
                <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
                <p className="text-[13px] text-gray-500">Analysing packages…</p>
              </div>
            )}

            {pageState === "error" && (
              <div className="animate-fade-up space-y-5">
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-[13px] font-medium text-red-800">{errorMessage}</p>
                </div>
                <button
                  onClick={reset}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] font-medium text-gray-700 transition-all duration-150 hover:bg-gray-50 hover:border-gray-300"
                >
                  Try again
                </button>
              </div>
            )}

            {pageState === "idle" && (
              <div className="animate-fade-up">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-0.5">
                    <h1 className="text-[18px] font-semibold text-gray-900 tracking-[-0.02em]">
                      Analyse packages
                    </h1>
                  </div>
                  <textarea
                    rows={12}
                    value={pasteText}
                    onChange={handlePasteChange}
                    placeholder="Paste package.json contents here…"
                    className="w-full rounded-lg border border-gray-300 bg-gray-50/60 px-3.5 py-3 text-[13px] font-mono text-gray-900 placeholder-gray-400 outline-none resize-none transition-all duration-150 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/10"
                  />
                  <div className="relative flex items-center gap-3">
                    <div className="h-px flex-1 bg-gray-200" />
                    <span className="text-[11px] text-gray-400 uppercase tracking-wide">or</span>
                    <div className="h-px flex-1 bg-gray-200" />
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFileChange}
                    className="block w-full text-[13px] text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-gray-700 hover:file:bg-gray-200 transition-all duration-150"
                  />
                  <button
                    type="submit"
                    disabled={!pasteText.trim() && !uploadedFile}
                    className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-[13px] font-medium text-white transition-all duration-150 hover:bg-indigo-700 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Analyse
                  </button>
                </form>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
