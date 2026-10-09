import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const obras = JSON.parse(await readFile(new URL("../src/conteudo/obras.json", import.meta.url), "utf8")).obras;

// Força o carregamento de todas as imagens lazy e espera cada uma terminar.
async function loadAllImages(page) {
  await page.evaluate(async () => {
    document.querySelectorAll('img[loading="lazy"]').forEach((img) => { img.loading = "eager"; });
    await Promise.all(
      [...document.images].map((img) =>
        img.complete ? null : new Promise((r) => { img.addEventListener("load", r); img.addEventListener("error", r); }),
      ),
    );
  });
  await page.waitForLoadState("networkidle");
}

test.describe("página", () => {
  test("carrega sem erros, sem violar a CSP e sem recursos quebrados", async ({ page }) => {
    const problems = [];
    page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    page.on("response", (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
    page.on("requestfailed", (r) => problems.push(`falhou: ${r.url()}`));
    await page.goto("/");
    await loadAllImages(page);
    expect(problems).toEqual([]);
    // Nenhum recurso de terceiros: fontes e imagens são servidas pelo próprio domínio.
    const external = await page.evaluate(() =>
      performance.getEntriesByType("resource").map((e) => e.name).filter((u) => !u.startsWith(location.origin)),
    );
    expect(external).toEqual([]);
  });

  test("todas as imagens carregam e têm alt", async ({ page }) => {
    await page.goto("/");
    await loadAllImages(page);
    const broken = await page.$$eval("img", (imgs) =>
      imgs.filter((img) => !img.complete || img.naturalWidth === 0 || !img.hasAttribute("alt")).map((img) => img.currentSrc || img.src),
    );
    expect(broken).toEqual([]);
  });

  for (const width of [320, 390, 820, 1440]) {
    test(`sem rolagem horizontal em ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await loadAllImages(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBe(0);
    });
  }

  test("publica todas as obras com texto curatorial", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".work")).toHaveCount(obras.length);
    for (const obra of obras) {
      const card = page.locator(`#obra-${obra.slug}`);
      await expect(card.locator(".work-title")).toHaveText(obra.titulo);
      await expect(card.locator(".work-details p").first()).not.toBeEmpty();
    }
  });

  test("metadados de compartilhamento e dados estruturados", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /^https:\/\/encantoverissimo\.com\.br\//);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://encantoverissimo.com.br/");
    const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
    const list = ld["@graph"].find((n) => n["@type"] === "ItemList");
    expect(list.itemListElement).toHaveLength(obras.length);
    expect(ld["@graph"].find((n) => n["@type"] === "Person").sameAs).toContain("https://www.instagram.com/encantoverissimo/");
  });
});

test.describe("acessibilidade", () => {
  // Estado final estático: estados intermediários de animação não são o que o leitor lê.
  test.use({ reducedMotion: "reduce" });

  test("sem violações WCAG 2.2 AA (axe)", async ({ page }) => {
    await page.goto("/");
    await loadAllImages(page);
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
  });
});

test.describe("visualizador de obras", () => {
  test("abre, navega pelo teclado e fecha restaurando a URL", async ({ page }) => {
    await page.goto("/");
    const viewer = page.locator("#viewer");
    await page.locator(".work-link").first().click();
    await expect(viewer).toBeVisible();
    await expect(page.locator("#viewer-title")).toHaveText(obras[0].titulo);
    await expect(page).toHaveURL(new RegExp(`#obra-${obras[0].slug}$`));
    await expect(viewer.locator(".viewer-figure img")).toBeVisible();

    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#viewer-title")).toHaveText(obras[1].titulo);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("#viewer-title")).toHaveText(obras.at(-1).titulo);

    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();
    await expect(page).toHaveURL(/\/$/); // o hash da obra é removido ao fechar
  });

  test("link direto abre a obra correspondente", async ({ page }) => {
    await page.goto("/#obra-espelho-dagua");
    await expect(page.locator("#viewer")).toBeVisible();
    await expect(page.locator("#viewer-title")).toHaveText("Espelho d’Água");
    await expect(page.locator(".viewer-text .work-contact")).toHaveAttribute("href", /wa\.me\/5568999852887/);
  });

  test("obra vertical não invade o título no visualizador", async ({ page }) => {
    await page.goto("/#obra-claridade");
    const img = page.locator(".viewer-figure img");
    await expect(img).toBeVisible();
    await img.evaluate((el) => el.decode().catch(() => {}));
    await page.waitForFunction(() => !window.gsap?.isTweening(document.querySelector(".viewer-figure img")));
    const imgBox = await img.boundingBox();
    const titleBox = await page.locator("#viewer-title").boundingBox();
    // imagem e título não se sobrepõem, em nenhum dos layouts (lado a lado ou empilhado)
    const sideBySide = imgBox.x + imgBox.width <= titleBox.x;
    expect(sideBySide || imgBox.y + imgBox.height <= titleBox.y + 1).toBe(true);
  });

  test("os versos do manifesto abrem as obras", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "cruzes que renascem" }).click();
    await expect(page.locator("#viewer-title")).toHaveText("Ressurreição");
  });
});

test.describe("servidor e publicação", () => {
  test("cabeçalhos de segurança", async ({ request }) => {
    const res = await request.get("/");
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("default-src 'none'");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  test("404 e arquivos internos não expostos", async ({ request }) => {
    const missing = await request.get("/nao-existe");
    expect(missing.status()).toBe(404);
    expect(await missing.text()).toContain("Este caminho se perdeu na mata.");
    expect((await request.get("/_headers")).status()).toBe(404);
  });

  test("dist/ contém só formatos publicáveis (nada de _privado/)", async () => {
    const allowed = /\.(html|css|js|svg|png|jpg|webp|avif|woff2|txt|xml)$|\/_headers$/;
    const files = (await readdir("dist", { recursive: true, withFileTypes: true }))
      .filter((d) => d.isFile())
      .map((d) => join(d.parentPath, d.name));
    expect(files.filter((f) => !allowed.test(f))).toEqual([]);
    expect(files.filter((f) => /docx|pdf|layout|privado/i.test(f))).toEqual([]);
  });
});

test.describe("movimento", () => {
  test("a entrada do hero assenta sozinha, sem JavaScript de animação", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(3000);
    const estados = await page.$$eval(".hero h1 .line > span, .hero-copy > p, .hero .pill-button", (els) =>
      els.map((el) => ({ opacity: getComputedStyle(el).opacity, translate: getComputedStyle(el).translate })),
    );
    for (const estado of estados) {
      expect(estado.opacity).toBe("1");
      expect(["none", "0px", "0px 0px", "0px 0%"]).toContain(estado.translate);
    }
  });

  test("nada fica invisível depois de percorrer a página", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.ScrollTrigger?.getAll().length > 0);
    const altura = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y <= altura; y += 300) {
      await page.evaluate((v) => window.scrollTo({ top: v, behavior: "instant" }), y);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(2600);
    const invisiveis = await page.$$eval(
      "main h2, main h3, main p, main .work-frame, main img, footer h2, footer p, footer a, footer li, .pill-button",
      (els) =>
        els
          .filter((el) => el.getClientRects().length && !el.closest("[hidden], .artist-bio:not([open])"))
          .filter((el) => {
            const cs = getComputedStyle(el);
            return parseFloat(cs.opacity) < 0.99 || (cs.clipPath !== "none" && !cs.clipPath.startsWith("inset(0"));
          })
          .map((el) => `${el.tagName}.${el.className}`),
    );
    expect(invisiveis).toEqual([]);
    expect(await page.locator(".split-line-mask").count()).toBe(0); // máscaras revertidas ao HTML original
  });

  test.describe("com movimento reduzido", () => {
    test.use({ reducedMotion: "reduce" });
    test("o GSAP nem é baixado", async ({ page }) => {
    const vendor = [];
    page.on("request", (r) => r.url().includes("/vendor/") && vendor.push(r.url()));
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(vendor).toEqual([]);
    await expect(page.locator(".hero h1 .line > span").first()).toHaveCSS("opacity", "1");
    });
  });
});
