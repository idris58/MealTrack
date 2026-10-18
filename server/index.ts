import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { startMealReminderScheduler, startNotificationDeliveryCleanupScheduler, startSoftDeleteCleanupScheduler } from "./push";
import { log } from "./logger";
import { initServerErrorTracking, captureServerError } from "./error-tracking";

const app = express();
// The app runs behind one trusted ingress/reverse proxy in production. Avoid `true`,
// which would let clients spoof their address via X-Forwarded-For.
app.set("trust proxy", 1);
const httpServer = createServer(app);

const supabaseUrl = process.env.VITE_SUPABASE_URL
  ? new URL(process.env.VITE_SUPABASE_URL)
  : null;
const connectSources = ["'self'"];
const scriptSources = ["'self'"];
const sandboxSources: string[] = [];
if (supabaseUrl) {
  connectSources.push(supabaseUrl.origin);
  connectSources.push(`${supabaseUrl.protocol === "https:" ? "wss:" : "ws:"}//${supabaseUrl.host}`);
}
if (process.env.NODE_ENV !== "production") {
  connectSources.push("ws:");
  scriptSources.push("'unsafe-eval'", "'unsafe-inline'");
  sandboxSources.push("allow-scripts", "allow-same-origin", "allow-forms", "allow-popups", "allow-modals");
}

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: connectSources,
      fontSrc: ["'self'", "https:", "data:"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      objectSrc: ["'none'"],
      scriptSrc: scriptSources,
      scriptSrcAttr: ["'none'"],
      ...(sandboxSources.length > 0 ? { sandbox: sandboxSources } : {}),
      styleSrc: ["'self'", "https:", "'unsafe-inline'"],
      workerSrc: ["'self'", "blob:"],
    },
  },
}));

app.use(compression());

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

(async () => {
  // ── Process-level safety nets ────────────────────────────────────────────
  process.on("uncaughtException", (err) => {
    log(`Uncaught Exception: ${err.stack || err.message}`, "error");
    captureServerError(err, { type: "uncaughtException" });
    // Let the process stay alive — Express can still serve requests.
    // If you want a hard restart in orchestrated environments, swap to:
    //   process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    const message =
      reason instanceof Error
        ? reason.stack || reason.message
        : String(reason);
    log(`Unhandled Rejection: ${message}`, "error");
    captureServerError(reason, { type: "unhandledRejection" });
  });

  await initServerErrorTracking();
  await registerRoutes(httpServer, app);
  app.use("/api", (_req, res) => {
    res.status(404).json({ message: "API route not found." });
  });
  startMealReminderScheduler();
  startNotificationDeliveryCleanupScheduler();
  startSoftDeleteCleanupScheduler();

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = status >= 500 ? "Internal Server Error" : err.message || "Internal Server Error";

    log(`Error ${status}: ${err.message || err}\n${err.stack || ""}`, "error");
    if (status >= 500) {
      captureServerError(err, { status, path: _req.path, method: _req.method });
    }

    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(port, "0.0.0.0", () => {
  log(`serving on port ${port}`);
  });
})();
