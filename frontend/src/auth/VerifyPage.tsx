import { useState, useEffect } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { apiClient, ApiError } from "../shared/api";

type VerifyState = "verifying" | "success" | "error";

function DotBackground() {
  return (
    <div
      className="fixed inset-0 -z-10 bg-[#f7f8fa]"
      style={{
        backgroundImage: "radial-gradient(circle, #d4d7de 1px, transparent 1px)",
        backgroundSize: "22px 22px",
      }}
    />
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="bg-white rounded-2xl border border-gray-200/90 overflow-hidden"
      style={{
        boxShadow:
          "0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.02)",
      }}
    >
      {children}
    </div>
  );
}

export function VerifyPage() {
  const [state, setState] = useState<VerifyState>("verifying");
  const [errorMessage, setErrorMessage] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");

    if (!token) {
      setState("error");
      setErrorMessage("No sign-in token found in this link.");
      return;
    }

    apiClient(`/auth/token/verify?token=${encodeURIComponent(token)}`, {
      method: "POST",
    })
      .then(() => {
        setState("success");
        setTimeout(() => navigate({ to: "/" }), 600);
      })
      .catch((err) => {
        setState("error");
        if (err instanceof ApiError && err.status === 401) {
          setErrorMessage("This link has expired or has already been used.");
        } else {
          setErrorMessage("Something went wrong. Please try again.");
        }
      });
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <DotBackground />
      <div className="w-[360px]">
        <Card>
          <div className="px-8 pt-7 pb-0">
            <span className="font-mono text-[11px] tracking-[0.18em] text-gray-400 uppercase select-none">
              upgrade-advisor
            </span>
          </div>

          <div className="px-8 pt-6 pb-8">
            {state === "verifying" && (
              <div className="animate-fade-up flex flex-col items-center py-4 gap-4 text-center">
                <div className="h-10 w-10 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-gray-900 tracking-[-0.01em]">
                    Signing you in…
                  </p>
                  <p className="mt-0.5 text-[12px] text-gray-400">Verifying your link.</p>
                </div>
              </div>
            )}

            {state === "success" && (
              <div className="animate-fade-up flex flex-col items-center py-4 gap-4 text-center">
                <div className="h-10 w-10 rounded-xl bg-green-50 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-gray-900 tracking-[-0.01em]">
                    You're signed in
                  </p>
                  <p className="mt-0.5 text-[12px] text-gray-400">Redirecting you now…</p>
                </div>
              </div>
            )}

            {state === "error" && (
              <div className="animate-fade-up space-y-5">
                <div className="flex flex-col items-center py-2 gap-4 text-center">
                  <div className="h-10 w-10 rounded-xl bg-red-50 flex items-center justify-center">
                    <XCircle className="h-5 w-5 text-red-500" />
                  </div>
                  <div>
                    <p className="text-[15px] font-semibold text-gray-900 tracking-[-0.01em]">
                      Link not valid
                    </p>
                    <p className="mt-0.5 text-[13px] text-gray-500 leading-relaxed max-w-[240px]">
                      {errorMessage}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => navigate({ to: "/sign-in" })}
                  className="w-full flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-[13px] font-medium text-white transition-all duration-150 hover:bg-indigo-700 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                >
                  Request a new link
                </button>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
