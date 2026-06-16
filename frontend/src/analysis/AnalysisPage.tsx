import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { apiClient, ApiError } from "../shared/api";
import { DotBackground } from "../shared/ui";
import { AnalysisForm } from "./AnalysisForm";
import { AnalysisStream } from "./AnalysisStream";
import { BudgetMeter } from "./BudgetMeter";
import { useAnalysisStream } from "./useAnalysisStream";
import type { CurrentActivity } from "./useAnalysisStream";
import { DEMO_LOG_ENTRIES, DEMO_ROWS, DEMO_SUMMARY, DEMO_COST, DEMO_BUDGET } from "./demoData";
import type { Budget, PageState } from "./types";

const DEMO_ACTIVITY: CurrentActivity = { currentPackage: null, currentToolName: null };
const FALLBACK_BUDGET_LIMIT = 2.00;

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="animate-fade-up space-y-5 mb-4">
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

function BudgetExceededBanner({ budget, onStartOver }: { budget: Budget; onStartOver: () => void }) {
  return (
    <div role="alert" className="animate-fade-up space-y-5 mb-4">
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-red-800 mb-0.5">Demo budget reached</p>
          <p className="text-sm text-red-700">
            You've used ${budget.used.toFixed(2)} of your ${budget.limit.toFixed(2)} demo budget.
          </p>
        </div>
        <BudgetMeter limit={budget.limit} used={budget.used} />
      </div>
      <button
        onClick={onStartOver}
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-all duration-150 hover:bg-gray-50 hover:border-gray-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        Start over
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
  const [budget, setBudget] = useState<Budget | null>(null);
  const [budgetExceeded, setBudgetExceeded] = useState(false);

  const { logEntries, analysisRows, summaryCounts, finalCost, runningCost, currentActivity } = useAnalysisStream(
    jobId,
    pageState === "streaming",
    (costUsd) => {
      setPageState("done");
      if (costUsd > 0) setBudget((prev) => prev ? { ...prev, used: prev.used + costUsd } : prev);
    },
    (msg) => { setErrorMessage(msg); setPageState("error"); },
    (costUsd) => {
      setBudget((prev) => prev
        ? { ...prev, used: prev.used + costUsd }
        : { limit: FALLBACK_BUDGET_LIMIT, used: costUsd });
      setBudgetExceeded(true);
      setPageState("error");
    },
  );

  useEffect(() => {
    if (isDemo) return;
    apiClient<{ limit: number; used: number; remaining: number }>("/packages/budget")
      .then((b) => setBudget({ limit: b.limit, used: b.used }))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) navigate({ to: "/sign-in" });
      });
  }, [isDemo, navigate]);

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
      if (err instanceof ApiError && err.status === 402) {
        const limit = typeof err.data.limit === "number" ? err.data.limit : FALLBACK_BUDGET_LIMIT;
        const used = typeof err.data.used === "number" ? err.data.used : limit;
        setBudget({ limit, used });
        setBudgetExceeded(true);
        setPageState("error");
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
    setBudgetExceeded(false);
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
          runningCost={isDemo ? 0 : runningCost}
          budget={isDemo ? DEMO_BUDGET : budget}
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
        {budgetExceeded && budget && (
          <BudgetExceededBanner budget={budget} onStartOver={reset} />
        )}
        {pageState === "error" && !budgetExceeded && (
          <ErrorBanner message={errorMessage} onRetry={reset} />
        )}
        <AnalysisForm onSubmit={handleSubmit} budget={budget} />
      </div>
    </main>
  );
}
