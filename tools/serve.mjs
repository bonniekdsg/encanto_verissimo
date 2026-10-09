// Servidor estático de dist/ que aplica as regras de dist/_headers, para que o
// ambiente local (e os testes) rodem com a mesma CSP e cache da produção.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = resolve(fileURLToPath(new URL("../dist", import.meta.url)));
const PORT = Number(process.env.PORT ?? 4391);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
};

function parseHeaders(source) {
  const rules = [];
  for (const line of source.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      const pattern = new RegExp(`^${line.trim().replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
      rules.push({ pattern, headers: {} });
    } else {
      const [name, ...value] = line.trim().split(":");
      rules.at(-1).headers[name.trim()] = value.join(":").trim();
    }
  }
  return rules;
}

const rules = parseHeaders(await readFile(join(DIST, "_headers"), "utf8"));

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  const relativePath = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, "");
  let file = resolve(DIST, relativePath);
  if (file !== DIST && !file.startsWith(DIST + sep)) {
    res.writeHead(403).end();
    return;
  }
  let status = 200;
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    await stat(file);
  } catch {
    file = join(DIST, "404.html");
    status = 404;
  }
  if (relativePath === "_headers") {
    file = join(DIST, "404.html");
    status = 404;
  }
  const headers = { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" };
  for (const rule of rules) if (rule.pattern.test(pathname)) Object.assign(headers, rule.headers);
  delete headers["Strict-Transport-Security"]; // HSTS em http://localhost não faz sentido
  // upgrade-insecure-requests faria o WebKit pedir https://localhost; em produção (HTTPS) não há diferença.
  if (headers["Content-Security-Policy"]) {
    headers["Content-Security-Policy"] = headers["Content-Security-Policy"].replace(/;\s*upgrade-insecure-requests/, "");
  }
  res.writeHead(status, headers).end(await readFile(file));
}).listen(PORT, () => console.log(`dist/ em http://localhost:${PORT}`));
