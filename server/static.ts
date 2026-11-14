import express, { type Express, type Request } from "express";
import fs from "fs";
import path from "path";
import { buildMetaBlock, resolvePublicMeta } from "./public-meta";

const META_BLOCK_PATTERN = /<!--\s*MT:META:START\s*-->([\s\S]*?)<!--\s*MT:META:END\s*-->/;
const SAFE_HOST_PATTERN = /^[A-Za-z0-9.\-:[\]]+$/;

/**
 * Absolute origin for og:/canonical/sitemap URLs. Prefers an explicit APP_URL
 * (set this in production to the public domain), otherwise falls back to the
 * request's proto+host, which honors the one trusted reverse proxy hop.
 */
function requestOrigin(req: Request): string {
  const appUrl = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (appUrl) return appUrl;
  const host = req.get("host") ?? "";
  if (SAFE_HOST_PATTERN.test(host)) return `${req.protocol}://${host}`;
  return "http://localhost";
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.get("/robots.txt", (req, res) => {
    const origin = requestOrigin(req);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.type("text/plain").send(
      [
        "User-agent: *",
        "Allow: /",
        "Disallow: /api/",
        "",
        `Sitemap: ${origin}/sitemap.xml`,
        "",
      ].join("\n"),
    );
  });

  app.get("/sitemap.xml", (req, res) => {
    const origin = xmlEscape(requestOrigin(req));
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.type("application/xml").send(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        `  <url><loc>${origin}/</loc><changefreq>monthly</changefreq><priority>1.0</priority></url>`,
        "</urlset>",
        "",
      ].join("\n"),
    );
  });

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
  app.use(async (req, res) => {
    // NB: no mount path here — app.use("*", ...) would strip the URL into
    // req.baseUrl and leave req.path === "/". Use the full original path.
    const pathname = (req.originalUrl || req.url || "/").split("?")[0].split("#")[0] || "/";
    const origin = requestOrigin(req);
    const isSharedPath = pathname === "/shared" || pathname.startsWith("/shared/");
    const manifestHref = isSharedPath ? "/shared-manifest.webmanifest" : "/manifest.webmanifest";

    // Resolve per-path metadata (title, description, robots, og:*). Falls
    // back to the default noindex block on any failure — SEO must never
    // take the app down.
    let metaHtml: string;
    let indexable = false;
    try {
      const meta = await resolvePublicMeta(pathname);
      indexable = meta.indexable;
      metaHtml = buildMetaBlock(meta, origin, pathname);
    } catch {
      metaHtml = buildMetaBlock(
        { title: "MealTrack", description: "MealTrack — shared meal, deposit and settlement tracker.", indexable: false },
        origin,
        pathname,
      );
    }

    let html = META_BLOCK_PATTERN.test(indexHtml)
      ? indexHtml.replace(
          META_BLOCK_PATTERN,
          `<!-- MT:META:START -->\n    ${metaHtml}\n    <!-- MT:META:END -->`,
        )
      : indexHtml.replace("</head>", `    ${metaHtml}\n  </head>`);

    html = html.replace(
      /<link\s+rel=["']manifest["'][^>]*>/i,
      `<link rel="manifest" href="${manifestHref}" />`,
    );

    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("X-Robots-Tag", indexable ? "index, follow" : "noindex, nofollow");
    res.type("html").send(html);
  });
}
