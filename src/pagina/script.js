// Visualizador de obras. Sem JS, cada card abre a imagem ampliada pelo próprio link.
const viewer = document.getElementById("viewer");
const works = [...document.querySelectorAll(".work")];

if (viewer && works.length) {
  const figure = viewer.querySelector(".viewer-figure");
  const title = viewer.querySelector("#viewer-title");
  const text = viewer.querySelector(".viewer-text");
  const counter = viewer.querySelector("#viewer-index");
  const VIEWER_SIZES = "(max-width: 1000px) 100vw, 58vw";
  let current = -1;

  const indexFromHash = (hash) => works.findIndex((work) => `#${work.id}` === hash);

  // direction: -1 anterior, 1 próxima, 0 abertura. O motion.js anima a troca a partir do evento.
  function render(index, direction = 0) {
    current = (index + works.length) % works.length;
    const work = works[current];

    const picture = work.querySelector("picture").cloneNode(true);
    picture.querySelectorAll("source").forEach((source) => source.setAttribute("sizes", VIEWER_SIZES));
    const img = picture.querySelector("img");
    img.loading = "eager";
    img.removeAttribute("class");
    figure.replaceChildren(picture);

    title.textContent = work.querySelector(".work-title").textContent;
    text.replaceChildren(...work.querySelector(".work-details").cloneNode(true).childNodes);
    counter.textContent = String(current + 1);
    text.parentElement.scrollTop = 0;
    history.replaceState(null, "", `#${work.id}`);
    viewer.dispatchEvent(new CustomEvent("viewer:change", { detail: { direction } }));
  }

  function open(index) {
    render(index);
    if (!viewer.open) viewer.showModal();
  }

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest(".work-link, a[href^='#obra-']");
    if (!link) return;
    const work = link.closest(".work");
    const index = work ? works.indexOf(work) : indexFromHash(link.getAttribute("href"));
    if (index < 0) return;
    event.preventDefault();
    open(index);
  });

  viewer.querySelector(".viewer-close").addEventListener("click", () => viewer.close());
  viewer.querySelector(".viewer-prev").addEventListener("click", () => render(current - 1, -1));
  viewer.querySelector(".viewer-next").addEventListener("click", () => render(current + 1, 1));
  viewer.addEventListener("click", (event) => {
    if (event.target === viewer) viewer.close();
  });
  viewer.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") render(current - 1, -1);
    if (event.key === "ArrowRight") render(current + 1, 1);
  });
  viewer.addEventListener("close", () => {
    history.replaceState(null, "", location.pathname + location.search);
  });

  // Gesto de deslizar na imagem para navegar no celular.
  let startX = null;
  figure.addEventListener("pointerdown", (event) => { startX = event.clientX; });
  figure.addEventListener("pointerup", (event) => {
    if (startX === null) return;
    const delta = event.clientX - startX;
    startX = null;
    if (Math.abs(delta) > 50) render(current + (delta < 0 ? 1 : -1), delta < 0 ? 1 : -1);
  });

  // Links diretos: encantoverissimo.com.br/#obra-ressurreicao abre a obra.
  const openFromHash = () => {
    const index = indexFromHash(location.hash);
    if (index >= 0) open(index);
  };
  window.addEventListener("hashchange", openFromHash);
  openFromHash();
}
