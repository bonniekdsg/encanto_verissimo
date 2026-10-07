// Gera dist/ a partir de src/: imagens responsivas (AVIF + WebP), HTML com as
// obras de src/conteudo/obras.json, JSON-LD, sitemap e ícones.
// dist/ é a única pasta publicada; nada de _privado/ ou src/ chega ao ar.
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const DIST = join(ROOT, "dist");
const CACHE = join(ROOT, ".cache", "img");
const SITE_URL = "https://encantoverissimo.com.br";
const INSTAGRAM = "https://www.instagram.com/encantoverissimo/";
const WHATSAPP = "5568999852887";
const EMAIL = "mv@seringal.com";

const FORMATS = {
  avif: (img) => img.avif({ quality: 52, effort: 6 }),
  webp: (img) => img.webp({ quality: 78, effort: 6 }),
};

// Larguras-alvo por imagem. Nunca ampliamos: larguras acima do original viram o original.
const OBRA_WIDTHS = [480, 800, 1200];
const MARCA = {
  "bg-hero-trono": { widths: [800, 1280, 1920] },
  "bg-folhas": { widths: [1000, 1983] },
  "bg-rodape": { widths: [1100, 2172] },
  marcio: { widths: [560, 900, 1254], trimLeft: 24 }, // remove a faixa rosada na borda esquerda da foto original
  "livro-mockup": { widths: [440, 660, 875] },
  "instituto-origena": { widths: [600, 1000, 1450] },
};

// ---------------------------------------------------------------- utilidades

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// JSON dentro de <script> não pode conter "</script>" nem comentários HTML.
const safeJson = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

const whatsappLink = (text) => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`;

async function sourceFor(dir, base) {
  const files = await readdir(dir);
  const match = files.find((f) => f.replace(/\.[^.]+$/, "") === base);
  if (!match) throw new Error(`Imagem de origem não encontrada: ${join(dir, base)}.*`);
  return join(dir, match);
}

// Gera as variantes de uma imagem, com cache em .cache/ por hash do conteúdo.
async function renderVariants(srcPath, outDir, name, widths, { trimLeft = 0 } = {}) {
  const source = await readFile(srcPath);
  const buffer = trimLeft
    ? await sharp(source).rotate().extract(await sharp(source).metadata().then((m) => ({ left: trimLeft, top: 0, width: m.width - trimLeft, height: m.height }))).toBuffer()
    : source;
  const meta = await sharp(buffer).metadata();
  const hash = createHash("sha256").update(buffer).update(JSON.stringify(widths)).digest("hex").slice(0, 12);
  const finalWidths = [...new Set(widths.map((w) => Math.min(w, meta.width)))].sort((a, b) => a - b);
  const variants = [];
  await mkdir(join(DIST, outDir), { recursive: true });
  await mkdir(CACHE, { recursive: true });
  for (const width of finalWidths) {
    const height = Math.round((meta.height * width) / meta.width);
    for (const [format, encode] of Object.entries(FORMATS)) {
      const file = `${name}-${width}.${hash.slice(0, 8)}.${format}`; // hash no nome: cache imutável
      const cached = join(CACHE, `${hash}-${file}`);
      const exists = await stat(cached).then(() => true, () => false);
      if (!exists) {
        await encode(sharp(buffer).rotate().resize({ width, withoutEnlargement: true })).toFile(cached);
      }
      await cp(cached, join(DIST, outDir, file));
      variants.push({ width, height, format, url: `${outDir}/${file}` });
    }
  }
  return { width: meta.width, height: meta.height, variants };
}

const srcset = (img, format) =>
  img.variants.filter((v) => v.format === format).map((v) => `${v.url} ${v.width}w`).join(", ");
const largest = (img, format) => img.variants.filter((v) => v.format === format).at(-1);
const nearest = (img, format, target) =>
  img.variants.filter((v) => v.format === format).find((v) => v.width >= target) ?? largest(img, format);

function picture(img, { alt, sizes, className = "", loading = "lazy", fetchpriority }) {
  const fallback = nearest(img, "webp", 800);
  const attrs = [
    `src="${fallback.url}"`,
    `width="${img.width}"`,
    `height="${img.height}"`,
    `alt="${escapeHtml(alt)}"`,
    `loading="${loading}"`,
    `decoding="async"`,
    fetchpriority ? `fetchpriority="${fetchpriority}"` : "",
    className ? `class="${className}"` : "",
  ].filter(Boolean);
  return `<picture><source type="image/avif" srcset="${srcset(img, "avif")}" sizes="${sizes}"><source type="image/webp" srcset="${srcset(img, "webp")}" sizes="${sizes}"><img ${attrs.join(" ")}></picture>`;
}

// ---------------------------------------------------------------- obras

const DESTAQUE_SIZES = {
  primaria: "(max-width: 600px) calc(100vw - 48px), (max-width: 1470px) 46vw, 680px",
  secundaria: "(max-width: 600px) calc(100vw - 48px), (max-width: 1470px) 46vw, 680px",
  terciaria: "(max-width: 600px) calc(100vw - 48px), (max-width: 1470px) 46vw, 680px",
};
const ACERVO_SIZES = "(max-width: 600px) 86vw, (max-width: 1000px) calc(50vw - 60px), min(30vw, 500px)";

// Galeria como montagem de exposição: três colunas escalonadas, cada uma um trecho
// contínuo do acervo (a ordem de leitura segue a do visualizador). As alturas são medidas
// em larguras de coluna; os deslocamentos espelham .archive-head e as margens das
// colunas 2 e 3 em styles.css. Obras altas são limitadas a ACERVO_MAX_ALTURA.
const ACERVO_MAX_ALTURA = "min(78svh, 760px)";
const ACERVO_PROPORCAO_MAX = 1.6; // equivalente a ACERVO_MAX_ALTURA numa coluna típica
const ACERVO_LEGENDA = 0.24;
const ACERVO_DESLOCAMENTOS = [0.95, 0.35, 0.75];

function hangColumns(obras, images) {
  const heights = obras.map((o) => {
    const img = images.obras[o.slug];
    return Math.min(img.height / img.width, ACERVO_PROPORCAO_MAX) + ACERVO_LEGENDA;
  });
  const sum = (a, b) => heights.slice(a, b).reduce((t, h) => t + h, 0);
  let best = null;
  for (let i = 1; i < obras.length - 1; i++) {
    for (let j = i + 1; j < obras.length; j++) {
      const cols = [sum(0, i), sum(i, j), sum(j, obras.length)].map((h, c) => h + ACERVO_DESLOCAMENTOS[c]);
      const tallest = Math.max(...cols);
      if (!best || tallest < best.tallest) best = { tallest, cuts: [i, j] };
    }
  }
  const [i, j] = best.cuts;
  return [obras.slice(0, i), obras.slice(i, j), obras.slice(j)];
}

const tecnicaCurta = (obra) =>
  obra.superficie ? `Óleo sobre ${obra.superficie[0].toLowerCase()}${obra.superficie.slice(1)}` : null;

function obraMeta(obra) {
  return [obra.tecnica, obra.dimensoes && `${obra.dimensoes} (nas extremidades)`].filter(Boolean);
}

function obraItem(obra, img, { sizes, className, headingLevel, legenda = false }) {
  const meta = obraMeta(obra);
  const big = largest(img, "webp");
  const h = `h${headingLevel}`;
  return `<li class="work ${className}" id="obra-${obra.slug}" data-slug="${obra.slug}">
  <a class="work-link" href="${big.url}" aria-label="Ver a obra ${escapeHtml(obra.titulo)}">
    <span class="work-frame">${picture(img, { alt: obra.alt, sizes })}</span>
  </a>
  <${h} class="work-title">${escapeHtml(obra.titulo)}</${h}>
  ${(() => {
    // As medidas são uma unidade: nunca quebram no meio ("1,31 × / 0,66 m").
    const medidas = obra.dimensoes && `<span class="nowrap">${escapeHtml(obra.dimensoes)}</span>`;
    const linha = (legenda ? [tecnicaCurta(obra) && escapeHtml(tecnicaCurta(obra)), medidas] : [medidas]).filter(Boolean);
    return linha.length ? `<p class="work-size">${linha.join(" · ")}</p>` : "";
  })()}
  <div class="work-details" hidden>
    ${meta.length ? `<p class="work-meta">${meta.map(escapeHtml).join("<span aria-hidden=\"true\"> · </span>")}</p>` : ""}
    ${obra.texto.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n    ")}
    <a class="work-contact" href="${whatsappLink(`Olá, Márcio! Vi a obra “${obra.titulo}” no site e gostaria de conversar sobre ela.`)}" target="_blank" rel="noopener">Conversar sobre esta obra</a>
  </div>
</li>`;
}

// ---------------------------------------------------------------- logo, ícones e OG

// Mesmo degradê do título do hero (styles.css, .hero h1 span) nas partes claras do logo.
// Como no título, cada linha recebe o degradê inteiro na própria altura: a pena,
// "Encanto" e "Veríssimo". Índices e alturas medidos em src/marca/logo.svg (viewBox 1126×688).
const TITLE_GRADIENT = [[0, "#ffe3c4"], [0.46, "#f7c69a"], [1, "#e3925a"]];
const LOGO_GROUPS = {
  pena: { paths: [1], y: [9, 421] },
  encanto: { paths: [2, 3, 4, 5, 6], y: [233, 419] },
  verissimo: { paths: [7, 8, 9, 10, 11, 12, 13, 14, 15], y: [404, 583] },
};

const gradientDef = (id) => {
  const [y1, y2] = LOGO_GROUPS[id].y;
  const stops = TITLE_GRADIENT.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("");
  return `<linearGradient id="ouro-${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${y1}" x2="0" y2="${y2}">${stops}</linearGradient>`;
};

function gradientLogo(svg) {
  const count = svg.match(/<path[^>]*\/>/gs)?.length;
  if (count !== 16) throw new Error(`logo.svg mudou (${count} caminhos, esperados 16): revise LOGO_GROUPS.`);
  let index = 0;
  const out = svg
    .replace(/<!--.*?-->\s*/gs, "")
    .replace(/<path[^>]*\/>/gs, (path) => {
      const group = Object.keys(LOGO_GROUPS).find((id) => LOGO_GROUPS[id].paths.includes(index));
      index += 1;
      return group ? path.replace('class="st1"', `fill="url(#ouro-${group})"`) : path;
    })
    // O pingo do último "i" de "Veríssimo" é um <circle>, não um <path>.
    .replace(/<circle class="st1"/g, '<circle fill="url(#ouro-verissimo)"')
    .replace("</defs>", `${Object.keys(LOGO_GROUPS).map(gradientDef).join("")}</defs>`);
  if (/<(?:path|circle|rect|polygon|ellipse)[^>]*class="st1"/.test(out)) {
    throw new Error("logo.svg: há formas claras sem degradê; revise LOGO_GROUPS.");
  }
  return out;
}

// Logo com hash do conteúdo no nome: cache imutável e troca instantânea quando o logo muda.
async function buildLogo() {
  const svg = gradientLogo(await readFile(join(SRC, "marca", "logo.svg"), "utf8"));
  const file = `logo.${createHash("sha256").update(svg).digest("hex").slice(0, 8)}.svg`;
  await writeFile(join(DIST, "img", file), svg);
  return { svg, url: `img/${file}` };
}

async function buildIcons(svg) {

  const paths = svg.match(/<path[^>]*\/>/gs).slice(0, 2); // pena: caminho teal + caminho claro
  const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-170 -10 710 710"><defs>${gradientDef("pena")}</defs><rect x="-170" y="-10" width="710" height="710" rx="150" fill="#001b19"/><g transform="translate(185 345) scale(.86) translate(-180 -345)">${paths
    .join("")
    .replace(/class="st0"/g, 'fill="#5f9599"')}</g></svg>`;
  await writeFile(join(DIST, "favicon.svg"), mark);
  await sharp(Buffer.from(mark)).resize(180, 180).png().toFile(join(DIST, "apple-touch-icon.png"));
  await sharp(Buffer.from(mark)).resize(32, 32).png().toFile(join(DIST, "favicon-32.png"));

  // Imagem de compartilhamento 1200×630: arte do hero + véu escuro + logo.
  const veil = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#000e0c" stop-opacity=".92"/><stop offset=".45" stop-color="#000e0c" stop-opacity=".55"/><stop offset=".75" stop-color="#000e0c" stop-opacity="0"/></linearGradient></defs><rect width="1200" height="630" fill="url(#g)"/></svg>`,
  );
  const logo = await sharp(Buffer.from(svg), { density: 144 }).resize({ width: 420 }).png().toBuffer();
  await sharp(await sourceFor(join(SRC, "marca"), "bg-hero-trono"))
    .resize(1200, 630, { fit: "cover", position: "centre" })
    .composite([{ input: veil }, { input: logo, left: 80, top: Math.round((630 - 257) / 2) }])
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(join(DIST, "img", "og.jpg"));
}

// ---------------------------------------------------------------- página

function jsonLd(obras, images) {
  const person = {
    "@type": "Person",
    "@id": `${SITE_URL}/#marcio`,
    name: "Márcio Veríssimo",
    jobTitle: "Artista visual",
    description: "Artista acreano, autodidata, cuja obra une espiritualidade, natureza e imaginação visionária.",
    image: `${SITE_URL}/${nearest(images.marca.marcio, "webp", 900).url}`,
    homeLocation: { "@type": "Place", name: "Rio Branco, Acre, Brasil" },
    email: `mailto:${EMAIL}`,
    sameAs: [INSTAGRAM],
  };
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": `${SITE_URL}/#site`, url: `${SITE_URL}/`, name: "Encanto Veríssimo", inLanguage: "pt-BR", publisher: { "@id": person["@id"] } },
      person,
      {
        "@type": "ItemList",
        name: "Obras de Márcio Veríssimo",
        itemListElement: obras.map((obra, i) => ({
          "@type": "ListItem",
          position: i + 1,
          item: {
            "@type": "VisualArtwork",
            "@id": `${SITE_URL}/#obra-${obra.slug}`,
            name: obra.titulo,
            artform: "Pintura",
            ...(obra.tecnica && { artMedium: "Óleo", artworkSurface: obra.superficie }),
            ...(obra.dimensoes && { size: `${obra.dimensoes} (nas extremidades)` }),
            description: obra.texto[0],
            image: `${SITE_URL}/${largest(images.obras[obra.slug], "webp").url}`,
            creator: { "@id": person["@id"] },
          },
        })),
      },
    ],
  };
}

async function buildPage(obras, images, logo) {
  let html = (await readFile(join(SRC, "pagina", "index.html"), "utf8")).replaceAll("img/logo.svg", logo.url);
  const destaques = ["primaria", "secundaria", "terciaria"].map((slot) => {
    const obra = obras.find((o) => o.destaque === slot);
    if (!obra) throw new Error(`Nenhuma obra marcada como destaque "${slot}".`);
    return obra;
  });
  const acervo = obras.filter((o) => !o.destaque);
  const item = (obra, opts) => obraItem(obra, images.obras[obra.slug], opts);

  const replacements = {
    "obras:primaria": item(destaques[0], { sizes: DESTAQUE_SIZES.primaria, className: "work-primary", headingLevel: 3 }),
    "obras:secundarias": destaques
      .slice(1)
      .map((o) => item(o, { sizes: DESTAQUE_SIZES[o.destaque], className: `work-${o.destaque === "secundaria" ? "secondary" : "tertiary"}`, headingLevel: 3 }))
      .join("\n"),
    "obras:acervo": hangColumns(acervo, images)
      .map((coluna, c) => {
        const itens = coluna.map((o) => {
          const lado = acervo.indexOf(o) % 2 === 0 ? "work-hang-left" : "work-hang-right";
          return item(o, { sizes: ACERVO_SIZES, className: `work-archive ${lado}`, headingLevel: 3, legenda: true });
        });
        return `<ul class="archive-col archive-col-${c + 1}" role="list">\n${itens.join("\n")}\n</ul>`;
      })
      .join("\n"),
    "obras:total": String(obras.length),
    jsonld: `<script type="application/ld+json">${safeJson(jsonLd(obras, images))}</script>`,
    "whatsapp:contato": escapeHtml(whatsappLink("Olá, Márcio! Vi suas obras no site e gostaria de conversar.")),
    "whatsapp:livro": escapeHtml(whatsappLink("Olá, Márcio! Quero ser avisado(a) do lançamento do livro “Vivências à Luz da Ayahuasca”.")),
    "hero:avif": srcset(images.marca["bg-hero-trono"], "avif"),
    "hero:webp": srcset(images.marca["bg-hero-trono"], "webp"),
    "hero:fallback": nearest(images.marca["bg-hero-trono"], "webp", 1280).url,
  };

  // <!-- @picture marca="nome" alt="…" sizes="…" class="…" loading="…" -->
  html = html.replace(/<!--\s*@picture\s+([^>]*?)\s*-->/g, (_, attrString) => {
    const attrs = Object.fromEntries([...attrString.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    const img = images.marca[attrs.marca];
    if (!img) throw new Error(`@picture: imagem de marca desconhecida "${attrs.marca}"`);
    return picture(img, { alt: attrs.alt ?? "", sizes: attrs.sizes, className: attrs.class, loading: attrs.loading ?? "lazy" });
  });
  html = html.replace(/\{\{\s*([\w:-]+)\s*\}\}/g, (_, key) => {
    if (!(key in replacements)) throw new Error(`Marcador desconhecido no template: {{${key}}}`);
    return replacements[key];
  });
  await writeFile(join(DIST, "index.html"), html);
}

// Os fundos decorativos são CSS; o build substitui url("marca:nome") por image-set().
async function buildCss(obras, images) {
  const css = await readFile(join(SRC, "pagina", "styles.css"), "utf8");
  const out = css.replace(/url\("marca:([\w-]+)(?:@(\d+))?"\)/g, (_, name, target) => {
    const img = images.marca[name];
    if (!img) throw new Error(`CSS: imagem de marca desconhecida "${name}"`);
    const width = Number(target ?? Infinity);
    const avif = nearest(img, "avif", width);
    const webp = nearest(img, "webp", width);
    return `image-set(url("${avif.url}") type("image/avif"), url("${webp.url}") type("image/webp"))`;
  });
  // Enquadramento por obra nos destaques (sem style inline, por causa da CSP).
  const focos = obras
    .filter((o) => o.foco)
    .map((o) => `#obra-${o.slug} .work-frame img { object-position: ${o.foco}; }`)
    .join("\n");
  // Na galeria, obras altas encolhem em largura para caber em ACERVO_MAX_ALTURA, sem recorte.
  const alturas = obras
    .filter((o) => !o.destaque)
    .map((o) => {
      const img = images.obras[o.slug];
      return `#obra-${o.slug} .work-link { max-width: calc(${ACERVO_MAX_ALTURA} * ${(img.width / img.height).toFixed(4)}); }`;
    })
    .join("\n");
  await writeFile(join(DIST, "styles.css"), `${out}\n/* gerado: enquadramento das obras */\n${focos}\n${alturas}\n`);
}

// ---------------------------------------------------------------- main

async function main() {
  const started = performance.now();
  if (relative(ROOT, DIST) !== "dist") throw new Error("Caminho de saída inesperado.");
  await rm(DIST, { recursive: true, force: true });
  await mkdir(join(DIST, "img"), { recursive: true });

  const { obras } = JSON.parse(await readFile(join(SRC, "conteudo", "obras.json"), "utf8"));
  const slugs = new Set();
  for (const obra of obras) {
    for (const field of ["slug", "titulo", "imagem", "alt", "texto"]) {
      if (!obra[field]) throw new Error(`Obra sem "${field}": ${JSON.stringify(obra).slice(0, 80)}`);
    }
    if (slugs.has(obra.slug)) throw new Error(`Slug duplicado: ${obra.slug}`);
    slugs.add(obra.slug);
  }

  const images = { obras: {}, marca: {} };
  await Promise.all([
    ...obras.map(async (obra) => {
      images.obras[obra.slug] = await renderVariants(join(SRC, "obras", obra.imagem), "img/obras", obra.slug, OBRA_WIDTHS);
    }),
    ...Object.entries(MARCA).map(async ([name, { widths, ...options }]) => {
      images.marca[name] = await renderVariants(await sourceFor(join(SRC, "marca"), name), "img", name, widths, options);
    }),
  ]);

  const statics = ["script.js", "_headers", "robots.txt", "fontes"];
  await Promise.all(statics.map((f) => cp(join(SRC, "pagina", f), join(DIST, f), { recursive: true })));
  const logo = await buildLogo();
  const notFound = await readFile(join(SRC, "pagina", "404.html"), "utf8");
  await Promise.all([
    writeFile(join(DIST, "404.html"), notFound.replaceAll("/img/logo.svg", `/${logo.url}`)),
    buildPage(obras, images, logo),
    buildCss(obras, images),
    buildIcons(logo.svg),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  await writeFile(
    join(DIST, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE_URL}/</loc><lastmod>${today}</lastmod></url></urlset>\n`,
  );

  console.log(`dist/ gerado em ${((performance.now() - started) / 1000).toFixed(1)}s — ${obras.length} obras.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
