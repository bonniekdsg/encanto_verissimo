// Camada de movimento: GSAP + ScrollTrigger + SplitText.
// A entrada do hero é CSS (styles.css), para não depender de JavaScript no primeiro quadro.
// Este arquivo só baixa o GSAP quando o visitante não pediu movimento reduzido. Se algo falhar,
// tudo o que foi criado é revertido e o site segue estático e completo.
(() => {
  const VENDOR = ["{{vendor:gsap}}", "{{vendor:ScrollTrigger}}", "{{vendor:SplitText}}"];
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const load = (src) =>
    new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = false; // baixa em paralelo, executa em ordem
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });

  Promise.all(VENDOR.map(load))
    .then(() => document.fonts.ready) // linhas só podem ser medidas com a fonte final
    .then(() => init(window.gsap, window.ScrollTrigger, window.SplitText))
    .catch(() => {}); // sem GSAP o site permanece estático

  function init(gsap, ScrollTrigger, SplitText) {
    gsap.registerPlugin(ScrollTrigger, SplitText);
    ScrollTrigger.config({ ignoreMobileResize: true }); // a barra do Safari iOS não recalcula tudo
    gsap.defaults({ ease: "power3.out", duration: 1 });

    const CINE = "expo.out";
    const START = "clamp(top 88%)"; // clamp: elementos no fim da página também disparam
    const done = (el) => el.dataset.revealed === "1";
    const markDone = (els) => els.forEach((el) => (el.dataset.revealed = "1"));

    // ------------------------------------------------------------ utilitários

    // Fade + leve subida, uma vez, quando o elemento se aproxima da área visível.
    function reveal(targets, { trigger, ...vars } = {}) {
      const els = gsap.utils.toArray(targets).filter((el) => !done(el));
      if (!els.length) return;
      gsap.from(els, {
        opacity: 0, y: 22, stagger: 0.12, ...vars,
        scrollTrigger: { trigger: trigger || els[0], start: START, once: true },
        onComplete: () => markDone(els),
      });
    }

    // Título revelado linha a linha por máscara vertical. Ao terminar, o HTML original volta:
    // nenhuma máscara fica cortando acentos e o texto reflui normalmente em redimensionamentos.
    function lineReveal(selector, { delay = 0, stagger = 0.12 } = {}) {
      const el = document.querySelector(selector);
      if (!el || done(el)) return;
      SplitText.create(el, {
        type: "lines", mask: "lines", tag: "span", linesClass: "split-line", autoSplit: true,
        onSplit(self) {
          return gsap.from(self.lines, {
            yPercent: 112, duration: 1.15, ease: CINE, stagger, delay,
            scrollTrigger: { trigger: el, start: START, once: true },
            onComplete: () => { markDone([el]); self.revert(); },
          });
        },
      });
    }

    // Título com linhas explícitas no HTML (.line > span): mesma máscara, sem SplitText.
    function maskLines(selector, { delay = 0, stagger = 0.16 } = {}) {
      const el = document.querySelector(selector);
      if (!el || done(el)) return;
      gsap.from(el.querySelectorAll(".line > span"), {
        yPercent: 112, duration: 1.15, ease: CINE, stagger, delay,
        scrollTrigger: { trigger: el, start: START, once: true },
        onComplete: () => markDone([el]),
      });
    }

    // Ornamento: os fios se desenham a partir da estrela; a estrela acende.
    function ornament(selector, delay = 0.25) {
      const el = document.querySelector(selector);
      if (!el || done(el)) return;
      const lines = [...el.querySelectorAll("span")];
      lines.forEach((line) => {
        gsap.set(line, { transformOrigin: line.nextElementSibling?.tagName === "svg" ? "right center" : "left center" });
      });
      gsap.timeline({ delay, scrollTrigger: { trigger: el, start: START, once: true }, onComplete: () => markDone([el]) })
        .from(lines, { scaleX: 0, duration: 1.1, ease: CINE })
        .from(el.querySelectorAll("svg"), { opacity: 0, scale: 0.4, rotation: -45, duration: 0.8, stagger: 0.12 }, 0.15);
    }

    // Parallax ligado ao scroll (scrub). Só transform: nada de layout.
    function drift(target, trigger, from, to, extra = {}) {
      gsap.fromTo(target, from, { ...to, ease: "none", scrollTrigger: { trigger, start: "top bottom", end: "bottom top", scrub: true, ...extra } });
    }

    // ------------------------------------------------------------ seções

    function hero(depth) {
      const heroEl = document.querySelector(".hero");
      // O fundo desce mais devagar que o conteúdo; o texto se afasta ao sair de cena.
      gsap.to(".hero-art", { yPercent: 14 * depth, ease: "none", scrollTrigger: { trigger: heroEl, start: "top top", end: "bottom top", scrub: true } });
      gsap.to(".hero-copy", { y: -70 * depth, opacity: 0.2, ease: "none", scrollTrigger: { trigger: heroEl, start: "top top", end: "bottom top", scrub: true } });
      // Respiração do fundo e fio de luz pausam fora da tela.
      ScrollTrigger.create({
        trigger: heroEl, start: "top bottom", end: "bottom top",
        onToggle: (self) => heroEl.classList.toggle("is-offscreen", !self.isActive),
      });
    }

    function featured(depth) {
      lineReveal("#obras-title");
      ornament(".works-lead .ornament");
      document.querySelectorAll(".works .work").forEach((work, i) => {
        const frame = work.querySelector(".work-frame");
        const img = frame.querySelector("img");
        const label = [work.querySelector(".work-title"), work.querySelector(".work-size")].filter(Boolean);
        // Folga de escala para o parallax interno sem expor bordas.
        if (!done(work)) {
          gsap.timeline({ delay: i === 0 ? 0 : 0.12 * i, scrollTrigger: { trigger: work, start: START, once: true }, onComplete: () => markDone([work]) })
            .fromTo(frame, { clipPath: "inset(100% 0% 0% 0% round 8px)" }, { clipPath: "inset(0% 0% 0% 0% round 8px)", duration: 1.4, ease: "power4.inOut" })
            .fromTo(img, { scale: 1.22 }, { scale: 1.07, duration: 2, ease: CINE }, 0)
            .from(label[0], { yPercent: 80, opacity: 0, duration: 0.9 }, 0.75)
            .from(label.slice(1), { opacity: 0, duration: 0.9 }, 0.95);
        } else {
          gsap.set(img, { scale: 1.07 });
        }
        // Imagem e legenda em velocidades diferentes.
        drift(img, frame, { yPercent: -3 * depth }, { yPercent: 3 * depth });
        drift(label, work, { y: 14 * depth }, { y: -14 * depth });
      });
    }

    function gallery({ desktop, phone }) {
      lineReveal("#galeria-title");
      ornament(".archive-head .ornament");
      reveal(".archive-head p", { delay: 0.2 });

      // Direção da descoberta varia com a montagem: no desktop a coluna do meio desce do alto;
      // no celular cada obra surge do lado em que está pendurada.
      const shapeFor = (item) => {
        if (phone) return item.classList.contains("work-hang-right") ? "inset(0% 0% 0% 100%)" : "inset(0% 100% 0% 0%)";
        if (desktop && item.closest(".archive-col-2")) return "inset(0% 0% 100% 0%)";
        return "inset(100% 0% 0% 0%)";
      };
      const items = gsap.utils.toArray(".work-archive").filter((item) => !done(item));
      items.forEach((item) => {
        gsap.set(item.querySelector(".work-frame"), { opacity: 0 });
        gsap.set(item.querySelector(".work-frame img"), { clipPath: shapeFor(item), scale: 1.12 });
        gsap.set([item.querySelector(".work-title"), item.querySelector(".work-size")], { opacity: 0, y: 14 });
      });
      ScrollTrigger.batch(items, {
        start: "clamp(top 90%)", once: true,
        onEnter: (batch) =>
          batch.forEach((item, i) => {
            gsap.timeline({ delay: i * 0.14, onComplete: () => markDone([item]) })
              .to(item.querySelector(".work-frame"), { opacity: 1, duration: 0.6, ease: "power2.out" })
              .to(item.querySelector(".work-frame img"), { clipPath: "inset(0% 0% 0% 0%)", duration: 1.3, ease: "power4.inOut" }, 0)
              .to(item.querySelector(".work-frame img"), { scale: 1, duration: 1.8, ease: CINE, clearProps: "clipPath,scale" }, 0)
              .to([item.querySelector(".work-title"), item.querySelector(".work-size")], { opacity: 1, y: 0, duration: 0.9, stagger: 0.08 }, 0.6);
          }),
      });

      // Profundidade da parede: as colunas deslizam em velocidades diferentes.
      if (desktop) {
        drift(".archive-col-2", ".archive", { y: 30 }, { y: -50 });
        drift(".archive-col-3", ".archive", { y: 60 }, { y: -90 });
      }
    }

    function artist(depth) {
      const portrait = document.querySelector(".artist-portrait");
      const img = portrait.querySelector("img");
      if (!done(portrait)) {
        gsap.fromTo(portrait, { clipPath: "inset(100% 0% 0% 0%)" }, {
          clipPath: "inset(0% 0% 0% 0%)", duration: 1.5, ease: "power4.inOut", clearProps: "clipPath",
          scrollTrigger: { trigger: portrait, start: START, once: true }, onComplete: () => markDone([portrait]),
        });
      }
      gsap.set(img, { scale: 1.1 });
      drift(img, ".artist", { yPercent: -4 * depth }, { yPercent: 4 * depth });

      maskLines("#artista-title");
      ornament(".artist .ornament", 0.35);
      reveal([".artist-lead", ".artist-bio", ".artist .text-link"], { trigger: ".artist-copy", delay: 0.35, stagger: 0.14 });

      // Biografia completa: os parágrafos chegam um a um quando o leitor abre.
      const bio = document.querySelector(".artist-bio");
      const onToggle = () => bio.open && gsap.from(bio.querySelectorAll("p"), { opacity: 0, y: 12, duration: 0.8, stagger: 0.12 });
      bio.addEventListener("toggle", onToggle);
      return () => bio.removeEventListener("toggle", onToggle);
    }

    function manifesto() {
      lineReveal("#manifesto-title", { stagger: 0.16 });
      // O texto ganha presença conforme chega ao centro da leitura (scrub, sem bloquear o scroll).
      const blocks = [
        ...document.querySelectorAll(".manifesto-body > p:not(.manifesto-litany):not(.manifesto-maps):not(.manifesto-signature)"),
        ...document.querySelectorAll(".manifesto-body .verse"),
      ];
      blocks.forEach((block) => {
        gsap.fromTo(block, { opacity: 0.16, y: 16 }, {
          opacity: 1, y: 0, ease: "none",
          scrollTrigger: { trigger: block, start: "top 96%", end: "top 76%", scrub: 0.6 }, // pleno antes do terço inferior
        });
      });
      // A frase final: cada sentença emerge por máscara, uma depois da outra.
      gsap.timeline({ scrollTrigger: { trigger: ".manifesto-climax", start: "top 88%", end: "bottom 72%", scrub: 0.8 } }) // completa ainda na metade de baixo da tela
        .from(".manifesto-climax .line > span", { yPercent: 112, opacity: 0, stagger: 0.55, duration: 1, ease: "power2.out" });
      reveal(".manifesto-signature", { y: 10 });
    }

    function book(depth, fine) {
      const art = document.querySelector(".ebook-art");
      const cover = art.querySelector("img");
      if (!done(art)) {
        // Folga negativa no recorte final preserva a sombra da capa.
        gsap.timeline({ scrollTrigger: { trigger: art, start: START, once: true }, onComplete: () => markDone([art]) })
          .fromTo(cover, { clipPath: "inset(100% -15% -25% -15%)", opacity: 0 }, { clipPath: "inset(-15% -15% -25% -15%)", opacity: 1, duration: 1.5, ease: "power4.inOut", clearProps: "clipPath" })
          .from(cover, { scale: 0.92, duration: 1.8, ease: CINE }, 0);
      }
      drift(art, ".ebook", { y: 40 * depth }, { y: -40 * depth });

      lineReveal("#livro-title");
      ornament(".ebook .ornament", 0.3);
      reveal([".ebook-lead", ".ebook .pill-button", ".ebook-note"], { trigger: ".ebook-copy", delay: 0.35 });

      if (!fine) return;
      // Perspectiva sutil na capa, guiada pelo cursor.
      gsap.set(art, { transformPerspective: 1100 });
      const rotX = gsap.quickTo(art, "rotationX", { duration: 0.8, ease: "power3.out" });
      const rotY = gsap.quickTo(art, "rotationY", { duration: 0.8, ease: "power3.out" });
      const move = (event) => {
        const box = art.getBoundingClientRect();
        rotY(((event.clientX - box.left) / box.width - 0.5) * 7);
        rotX(-((event.clientY - box.top) / box.height - 0.5) * 5);
      };
      const leave = () => { rotX(0); rotY(0); };
      art.addEventListener("pointermove", move);
      art.addEventListener("pointerleave", leave);
      return () => { art.removeEventListener("pointermove", move); art.removeEventListener("pointerleave", leave); };
    }

    function contact() {
      lineReveal(".contact h2");
      reveal([".contact-copy > p", ".contact-copy .pill-button", ".contact-links li"], { trigger: ".contact-copy", delay: 0.3, stagger: 0.1 });
      const visit = document.querySelector(".visit");
      if (!done(visit)) {
        gsap.timeline({ scrollTrigger: { trigger: visit, start: START, once: true }, onComplete: () => markDone([visit]) })
          .fromTo(visit, { clipPath: "inset(100% 0% 0% 0% round 10px)" }, { clipPath: "inset(0% 0% 0% 0% round 10px)", duration: 1.4, ease: "power4.inOut", clearProps: "clipPath" })
          .from(visit.querySelector("img"), { scale: 1.14, duration: 2, ease: CINE }, 0)
          .from(visit.querySelector("figcaption"), { opacity: 0, y: 10, duration: 0.9 }, 0.8);
      }
      const brand = document.querySelector(".footer-brand");
      if (!done(brand)) {
        const [left, right] = brand.querySelectorAll(":scope > span");
        gsap.set(left, { transformOrigin: "right center" });
        gsap.set(right, { transformOrigin: "left center" });
        gsap.timeline({ scrollTrigger: { trigger: brand, start: START, once: true }, onComplete: () => markDone([brand]) })
          .from([left, right], { scaleX: 0, duration: 1.3, ease: CINE })
          .from(brand.querySelector("a"), { opacity: 0, y: 10, duration: 1 }, 0.2);
      }
      reveal([".footer nav a", ".legal"], { trigger: ".footer nav", stagger: 0.06, y: 10 });
    }

    // Visualizador: a obra entra pelo lado da navegação; o texto chega em seguida.
    function viewer() {
      const dialog = document.getElementById("viewer");
      if (!dialog) return;
      const onChange = ({ detail: { direction } }) => {
        const img = dialog.querySelector(".viewer-figure img");
        const copy = [dialog.querySelector("#viewer-title"), ...dialog.querySelector(".viewer-text").children];
        gsap.fromTo(img, { opacity: 0, x: direction * 28, scale: direction ? 1 : 0.97 }, { opacity: 1, x: 0, scale: 1, duration: direction ? 0.7 : 0.9, delay: direction ? 0 : 0.12, overwrite: true });
        gsap.fromTo(copy, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.06, delay: direction ? 0.05 : 0.22, overwrite: true });
      };
      dialog.addEventListener("viewer:change", onChange);
      return () => dialog.removeEventListener("viewer:change", onChange);
    }

    // Rótulo contextual que acompanha o cursor nativo sobre as obras (só com mouse).
    function cursor() {
      const label = document.createElement("div");
      label.className = "cursor-label";
      label.setAttribute("aria-hidden", "true");
      label.textContent = "Ver obra";
      document.body.append(label);
      const x = gsap.quickTo(label, "x", { duration: 0.45, ease: "power3.out" });
      const y = gsap.quickTo(label, "y", { duration: 0.45, ease: "power3.out" });
      const move = (event) => { x(event.clientX + 18); y(event.clientY + 20); };
      const over = (event) => label.classList.toggle("is-visible", !!event.target.closest?.(".work-link"));
      window.addEventListener("pointermove", move, { passive: true });
      document.addEventListener("pointerover", over);
      return () => {
        window.removeEventListener("pointermove", move);
        document.removeEventListener("pointerover", over);
        label.remove();
      };
    }

    // ------------------------------------------------------------ orquestração

    let failed = false;
    const mm = gsap.matchMedia();
    mm.add(
      {
        desktop: "(min-width: 801px)",
        phone: "(max-width: 600px)",
        fine: "(hover: hover) and (pointer: fine)",
        reduce: "(prefers-reduced-motion: reduce)",
      },
      ({ conditions: { desktop, phone, fine, reduce } }) => {
        if (reduce) return; // preferência mudou com a página aberta: tudo é revertido
        const depth = desktop ? 1 : 0.45; // parallax mais contido em telas pequenas
        const cleanups = [];
        try {
          hero(depth);
          featured(depth);
          gallery({ desktop, phone });
          cleanups.push(artist(depth));
          manifesto();
          cleanups.push(book(depth, fine && desktop));
          contact();
          cleanups.push(viewer());
          if (fine) cleanups.push(cursor());
        } catch (error) {
          failed = true;
          console.warn("Movimento desativado:", error);
        }
        return () => cleanups.forEach((fn) => fn && fn());
      },
    );
    if (failed) mm.revert(); // nada fica escondido se algo falhar
  }
})();
