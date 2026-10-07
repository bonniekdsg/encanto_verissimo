# Encanto Veríssimo

Site de Márcio Veríssimo — arte visionária. Página única estática, gerada a partir de `src/` para `dist/`.

## Comandos

```sh
npm install
npm run build   # gera dist/ (primeira vez ~60s por causa do AVIF; depois, <1s com cache)
npm run serve   # serve dist/ em http://localhost:4391 com os mesmos cabeçalhos da produção
npm test        # build + testes de ponta a ponta (Playwright + axe) no Chrome instalado
```

Requer Node 22+ e Google Chrome (os testes usam o Chrome do sistema; sem ele, rode `npx playwright install chromium` e remova `channel` em `playwright.config.mjs`).

## Estrutura

```
src/
  conteudo/obras.json   fonte única das obras: título, técnica, dimensões, texto, alt, destaque
  obras/                fotos originais das obras (nome = slug)
  obras/desenhos/       7 desenhos recebidos sem título — fora do site até serem identificados
  marca/                logo, fundos, retrato, mockup do livro, foto do Instituto Orígena
  pagina/               template HTML, CSS, JS, 404, _headers, robots.txt, fontes
tools/
  build.mjs             imagens responsivas, HTML das obras, JSON-LD, sitemap, ícones, imagem OG
  serve.mjs             servidor local que aplica _headers
tests/site.spec.mjs     CSP, imagens, overflow, acessibilidade, visualizador, SEO, publicação
_privado/               material do cliente (docx, PDF, layout) — ignorado pelo git, nunca publicado
```

**Só `dist/` é publicado.** O build copia apenas o que a página usa; um teste falha se aparecer qualquer `.docx`, `.pdf` ou arquivo de `_privado/` em `dist/`.

## Editar conteúdo

- **Obras:** edite `src/conteudo/obras.json` e ponha a foto em `src/obras/<slug>.<ext>`. `destaque` (`primaria`, `secundaria`, `terciaria`) define o trio de abertura; as demais entram na Galeria, na ordem do arquivo. `foco` ajusta o recorte nos destaques.
- **Textos do artista, manifesto e livro:** `src/pagina/index.html`.
- **Imagens de marca:** `src/marca/`; larguras geradas em `MARCA` no `tools/build.mjs`. O hero usa `bg-hero-trono` (o anterior, `bg-hero`, fica guardado).

Cada obra tem link direto: `encantoverissimo.com.br/#obra-<slug>` abre o visualizador nela.

## Decisões

- **Imagens:** AVIF + WebP em 3 larguras, com hash do conteúdo no nome → cache `immutable` de 1 ano sem risco de servir versão velha.
- **Fontes no próprio domínio** (Fraunces para títulos, alinhada ao logo e à capa do livro; Literata para todo texto de leitura — a Cormorant Garamond foi substituída após usuários relatarem leitura difícil em tamanhos pequenos). Sem Google Fonts: nenhum IP de visitante enviado a terceiros (LGPD) e nada de terceiros no caminho crítico. Fraunces foi instanciada (SOFT=100, peso 500–700) e reduzida de 120 KB para 52 KB.
- **Ícones** de e-mail e Instagram: [Lucide](https://lucide.dev) (licença ISC), em SVG inline com o mesmo traço das setas.
- **CSP estrita** (`default-src 'none'`, sem inline), HSTS, `nosniff`, `frame-ancestors 'none'`. Sem `style=` inline: o enquadramento por obra é gerado como CSS.
- **Contato via WhatsApp** com mensagem pré-preenchida (inclusive por obra e para o aviso do lançamento do livro): sem formulário, sem backend e sem coleta de dados pelo site.

## Publicação

Pensado para **Cloudflare Pages** (ou Netlify — o formato de `_headers` e `404.html` é o mesmo): comando de build `npm run build`, diretório de saída `dist`. O domínio `encantoverissimo.com.br` está no Registro.br (DNSSEC ativo, válido até 13/05/2028).

## Pendências com o cliente

- Títulos, técnica e dimensões dos 7 desenhos em `src/obras/desenhos/`.
- Técnica e dimensões de *Senhora das Navegações* (ausentes no material).
- Trecho de *Mesa de Santíssimas Festas*: “de todos os reinos vem passarinhos” parece ter um erro de digitação — mantido como recebido.
- Foto do retrato e de *Senhora das Navegações* em resolução maior, se houver.
- PDF final do livro: quando existir, trocar o botão “Avise-me no lançamento” pelo download.
