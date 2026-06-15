import { useState, useEffect, useRef } from "react";
import { MailCheck, Loader2, ArrowRight, RefreshCw } from "lucide-react";
import { apiClient, ApiError } from "../shared/api";
import { DotBackground, Card, Wordmark } from "../shared/ui";

type FlowState = "idle" | "loading" | "sent" | "error";

const COOLDOWN_SECONDS = 60;

function AnimatedSection({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div key={id} className="animate-fade-up">
      {children}
    </div>
  );
}

export function SignInPage() {
  const [email, setEmail] = useState("");
  const [flowState, setFlowState] = useState<FlowState>("idle");
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    []
  );

  const startCooldown = () => {
    setCooldown(COOLDOWN_SECONDS);
    timerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const requestLink = async (target: string) => {
    setFlowState("loading");
    setError("");
    try {
      await apiClient("/auth/sign-in", {
        method: "POST",
        body: JSON.stringify({ email: target }),
      });
      setSentTo(target);
      setFlowState("sent");
      startCooldown();
    } catch (err) {
      setFlowState("error");
      setError(
        err instanceof ApiError && err.message
          ? err.message
          : "Something went wrong. Please try again."
      );
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    requestLink(email);
  };

  const handleResend = () => {
    if (cooldown > 0) return;
    if (timerRef.current) clearInterval(timerRef.current);
    requestLink(sentTo);
  };

  const reset = () => {
    setFlowState("idle");
    setError("");
    setSentTo("");
    if (timerRef.current) clearInterval(timerRef.current);
    setCooldown(0);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const isSent = flowState === "sent";

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <DotBackground />
      <div className="w-[360px]">
        <Card>
          <Wordmark />
          <div className="px-8 pt-5 pb-8">
            {!isSent ? (
              <AnimatedSection id="form">
                <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                  <div className="space-y-0.5">
                    <h1 className="text-[18px] font-semibold text-gray-900 tracking-[-0.02em]">
                      Sign in
                    </h1>
                    <p className="text-[13px] text-gray-500 leading-relaxed">
                      Enter your email to receive a sign-in link.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="email"
                      className="block text-[11px] font-semibold text-gray-600 tracking-wide uppercase"
                    >
                      Email address
                    </label>
                    <input
                      ref={inputRef}
                      id="email"
                      type="email"
                      required
                      autoFocus
                      autoComplete="email"
                      spellCheck={false}
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (flowState === "error") setError("");
                      }}
                      disabled={flowState === "loading"}
                      placeholder="you@company.com"
                      className="w-full rounded-lg border border-gray-300 bg-gray-50/60 px-3.5 py-2.5 text-[13px] text-gray-900 placeholder-gray-400 outline-none transition-all duration-150 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    {error && (
                      <p className="text-[12px] text-red-600 pt-0.5 animate-fade-up">{error}</p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={flowState === "loading" || !email.trim()}
                    className="group w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-[13px] font-medium text-white transition-all duration-150 hover:bg-indigo-700 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {flowState === "loading" ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Sending…
                      </>
                    ) : (
                      <>
                        Send link
                        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
                      </>
                    )}
                  </button>
                </form>
              </AnimatedSection>
            ) : (
              <AnimatedSection id="sent">
                <div className="space-y-5">
                  <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                    <MailCheck className="h-5 w-5 text-indigo-600" />
                  </div>

                  <div className="space-y-1">
                    <h1 className="text-[18px] font-semibold text-gray-900 tracking-[-0.02em]">
                      Check your inbox
                    </h1>
                    <p className="text-[13px] text-gray-600 leading-relaxed">
                      We sent a sign-in link to{" "}
                      <span className="font-medium text-gray-900">{sentTo}</span>.
                    </p>
                    <p className="text-[12px] text-gray-400">Expires in 15 minutes.</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleResend}
                      disabled={cooldown > 0}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] font-medium text-gray-700 transition-all duration-150 hover:bg-gray-50 hover:border-gray-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RefreshCw className="h-3 w-3" />
                      {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend link"}
                    </button>

                    <button
                      onClick={reset}
                      className="text-[12px] text-gray-400 hover:text-gray-600 transition-colors duration-150"
                    >
                      Use a different email
                    </button>
                  </div>
                </div>
              </AnimatedSection>
            )}
          </div>
        </Card>

        <p className="mt-4 text-center text-[11px] text-gray-400">
          Links are single-use and expire after 15 minutes.
        </p>
      </div>
    </div>
  );
}
