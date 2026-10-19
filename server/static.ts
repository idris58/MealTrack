import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath, {
    setHeaders(res, filePath) {
      const basename = path.basename(filePath).toLowerCase();
      if (basename === "index.html" || basename === "sw.js" || basename.endsWith("manifest.webmanifest") || basename === "manifest.json") {
        res.setHeader("Cache-Control", "no-cache");
      } else if (
        filePath.includes(`${path.sep}assets${path.sep}`) &&
        /-[a-z0-9_-]{8,}\.[^.]+$/i.test(basename)
      ) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        res.setHeader("Cache-Control", "public, max-age=3600");
      }
    },
  }));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
