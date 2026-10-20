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
    index: false,
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

  const indexHtml = fs.readFileSync(path.resolve(distPath, "index.html"), "utf8");

  // Serve the manifest matching the initial URL. Browsers may not reread a
  // manifest when a client-side route changes after the document has loaded.
  app.use("*", (req, res) => {
    const isSharedPath = req.path === "/shared" || req.path.startsWith("/shared/");
    const manifestHref = isSharedPath ? "/shared-manifest.webmanifest" : "/manifest.webmanifest";
    const html = indexHtml.replace(
      /<link\s+rel=["']manifest["'][^>]*>/i,
      `<link rel="manifest" href="${manifestHref}" />`,
    );
    res.setHeader("Cache-Control", "no-cache");
    res.type("html").send(html);
  });
}
