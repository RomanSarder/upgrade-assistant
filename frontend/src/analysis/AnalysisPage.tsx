import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { apiClient, ApiError } from "../shared/api";
import { DotBackground } from "../shared/ui";
import { AnalysisForm } from "./AnalysisForm";
import { AnalysisStream } from "./AnalysisStream";
import { useAnalysisStream } from "./useAnalysisStream";
import type { CurrentActivity } from "./useAnalysisStream";
import { DEMO_LOG_ENTRIES, DEMO_ROWS, DEMO_SUMMARY, DEMO_COST } from "./demoData";
import type { PageState } from "./types";

const DEMO_ACTIVITY: CurrentActivity = { currentPackage: null, currentToolName: null };

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="animate-fade-up space-y-5 mb-4">
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
        <p className="text-sm font-medium text-red-800">{message}</p>
      </div>
      <button
        onClick={onRetry}
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-all duration-150 hover:bg-gray-50 hover:border-gray-300"
      >
        Try again
      </button>
    </div>
  );
}

export function AnalysisPage() {
  const isDemo = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1";

  const navigate = useNavigate();
  const [pageState, setPageState] = useState<PageState>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const { logEntries, analysisRows, summaryCounts, finalCost, currentActivity } = useAnalysisStream(
    jobId,
    pageState === "streaming",
    () => setPageState("done"),
    (msg) => { setErrorMessage(msg); setPageState("error"); },
  );

  const handleSubmit = async (formData: FormData) => {
    setPageState("streaming");
    setErrorMessage("");
    setJobId(null);
    try {
      const { jobId: id } = await apiClient<{ jobId: string }>("/packages/analyse", {
        method: "POST",
        body: formData,
      });
      setJobId(id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        navigate({ to: "/sign-in" });
        return;
      }
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
    setJobId(null);
    setErrorMessage("");
  };

  if (isDemo || pageState === "streaming" || pageState === "done") {
    return (
      <main id="main-content">
        <DotBackground />
        <AnalysisStream
          isStreaming={isDemo ? false : pageState === "streaming"}
          logEntries={isDemo ? DEMO_LOG_ENTRIES : logEntries}
          analysisRows={isDemo ? DEMO_ROWS : analysisRows}
          summaryCounts={isDemo ? DEMO_SUMMARY : summaryCounts}
          finalCost={isDemo ? DEMO_COST : finalCost}
          currentActivity={isDemo ? DEMO_ACTIVITY : currentActivity}
          onReset={reset}
        />
      </main>
    );
  }

  return (
    <main id="main-content" className="min-h-screen flex items-center justify-center p-4">
      <DotBackground />
      <div className="w-full max-w-2xl">
        {pageState === "error" && (
          <ErrorBanner message={errorMessage} onRetry={reset} />
        )}
        <AnalysisForm onSubmit={handleSubmit} />
      </div>
    </main>
  );
}
