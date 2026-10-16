import * as Sentry from "@sentry/nextjs";

// Server-side error reporting only. Off unless SENTRY_DSN is set, so local runs,
// tests and CI send nothing. No browser SDK: the page CSP stays unchanged.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.SENTRY_DSN) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
    release: process.env.RAILWAY_GIT_COMMIT_SHA || undefined,
    tracesSampleRate: 0.2,
    // Research and financial data stay out of Sentry: errors, stack traces and timings only.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
      genAI: { inputs: false, outputs: false }
    },
    integrations: [Sentry.consoleLoggingIntegration({ levels: ["error", "warn"] })]
  });
}

export const onRequestError = Sentry.captureRequestError;
