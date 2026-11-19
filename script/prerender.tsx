import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { readFile, writeFile, mkdir } from "fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import LandingPage from "../client/src/pages/landing";
import { I18nProvider } from "../client/src/lib/i18n";
import { SEO, SITE_ORIGIN, buildPublicHeadTags, type SeoLocale } from "../shared/seo-meta";

const META_BLOCK_PATTERN = /<!--\s*MT:META:START\s*-->([\s\S]*?)<!--\s*MT:META:END\s*-->/;

function requestOrigin(): string {
  const appUrl = process.env.APP_URL?.trim().replace(/\/+$/, "");
  return appUrl || SITE_ORIGIN;
}

/** Static pages must not boot the SPA — that would wipe the prerendered DOM. */
function stripClientScripts(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<link\b[^>]*rel=["']modulepreload["'][^>]*>/gi, "");
}

function renderPublicPage(shell: string, locale: SeoLocale): string {
  const seo = SEO[locale];
  const origin = requestOrigin();

  const markup = renderToStaticMarkup(
    createElement(
      I18nProvider,
      { initialLocale: locale },
      createElement(LandingPage, { seoStatic: true }),
    ),
  );

  let html = stripClientScripts(shell);

  const headTags = `<!-- MT:META:START -->\n    ${buildPublicHeadTags(origin, locale)}\n    <!-- MT:META:END -->`;
  html = META_BLOCK_PATTERN.test(html)
    ? html.replace(META_BLOCK_PATTERN, headTags)
    : html.replace("</head>", `    ${headTags}\n  </head>`);

  html = html.replace(/<html\b[^>]*>/i, `<html lang="${seo.htmlLang}" data-seo-page="${locale}">`);
  html = html.replace(/<div id="root"><\/div>/, `<div id="root">${markup}</div>`);
  html = html.replace(
    /<\/body>/i,
    '  <script defer src="/seo-landing.js"></script>\n  </body>',
  );

  return html;
}

export async function prerenderPublicPages(): Promise<void> {
  const distPublic = path.resolve(process.cwd(), "dist", "public");
  const shell = await readFile(path.join(distPublic, "index.html"), "utf8");
  if (!META_BLOCK_PATTERN.test(shell)) {
    throw new Error("Built index.html is missing the MT:META marker block");
  }

  const targets: Array<{ locale: SeoLocale; dir: string }> = [
    { locale: "en", dir: path.join(distPublic, "seo") },
    { locale: "bn", dir: path.join(distPublic, "seo", "bn") },
  ];

  for (const { locale, dir } of targets) {
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), renderPublicPage(shell, locale), "utf8");
    console.log(`prerendered ${SEO[locale].path} (${locale})`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  prerenderPublicPages().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
