# SDD — Software Design Document (arch-draw)

> Desenho técnico detalhado do produto **arch-draw**. Descreve arquitetura,
> módulos, contratos, modelo de dados, segurança, build/deploy, testes e o
> design do rewrite incremental do motor do canvas.
>
> Complementa: [`gsd-arch-draw.md`](./gsd-arch-draw.md) (solução em alto nível)
> e [`engine-roadmap.md`](./engine-roadmap.md) (roadmap da engine).

---

## 1. Introdução

- **Público**: engenheiros que mantêm/evoluem o arch-draw.
- **Escopo**: todo o monorepo (`packages/domain`, `apps/api`, `apps/web`),
  infra e o plano do rewrite do canvas.
- **Convenções**: TypeScript ESM estrito (Node 22, TS 5.8), imutabilidade no
  domínio, Onion Architecture, Gitflow.

## 2. Visão arquitetural

Arquitetura em camadas com **regra de dependência apontando para dentro**:

```
http / delivery  →  application (use-cases + contracts/ports)  →  domain
        ▲                                   ▲
        └────────── infra (adapters) ───────┘   (implementa os ports)
```

- **domain** não conhece framework, HTTP, filesystem, Redis ou AWS.
- **application** define _ports_ (interfaces) e orquestra casos de uso.
- **infra** implementa os _ports_ (repositório comprimido, AWS, Redis).
- **http** é a camada de entrega (Fastify); `server.ts` é o _composition root_
  que injeta adapters concretos nos use-cases.

## 3. Monorepo, build e tooling

- **Gerenciador**: npm workspaces (`npm@11.12.1`), `"type": "module"`.
  Workspaces: `packages/*`, `apps/*`.
- **TS configs**: `tsconfig.base.json` (`target ES2022`, `module ESNext`,
  `moduleResolution Bundler`, `strict`, `noUncheckedIndexedAccess`,
  `isolatedModules`). `apps/web` tem alias `@arch-draw/domain` →
  `packages/domain/src/index.ts`.
- **Package linking**: `@arch-draw/domain` expõe _conditional exports_ — em dev
  (`development`/`types`) resolve o **source** `src/index.ts`; em produção
  (`import`) o build `dist/index.js`.
- **Scripts raiz**: `build`/`test`/`typecheck`/`lint` fazem fan-out
  `--workspaces --if-present`; gate agregado **`verify` = typecheck && lint &&
  test && build**; `format` (Prettier). `dev` → `scripts/dev.mjs` (sobe api +
  web em paralelo com shutdown coordenado).
- **Builds**:
  - `apps/web`: `@angular/build:application` (esbuild) → `apps/web/dist/browser`.
    Budgets prod: inicial warn **900 kB** / error **1100 kB**; estilo por
    componente warn 8 kB / error 16 kB.
  - `apps/api`: `tsc --noEmit` (typecheck) + `tsup` (ESM, `target node22`) →
    `apps/api/dist/main.js`.
  - `packages/domain`: `tsc` → `dist` com `.d.ts`.
- **"Lint"**: mapeado para compile TS (`ng build --configuration development` /
  `tsc --noEmit`). **Não há ESLint** — só Prettier para formatação.

## 4. Camada de domínio (`packages/domain`)

Pacote `@arch-draw/domain`, **puro** (sem `dependencies`), imutável (`Readonly`).

### 4.1 Modelo

- **`ArchitectureDocument`** (aggregate root): `{ version: 1, id, title,
  description, nodes[], edges[], mermaidSource, createdAt, updatedAt }`.
  `ARCHITECTURE_DOCUMENT_VERSION = 1`.
- **`ArchitectureNode`**: `{ id, kind, label, parentId?, position: Point,
  size: Size, color, properties?, collapsed?, collapsedIconKind?,
  expandedSize?, mermaidSource? }`.
- **`ArchitectureEdge`**: `{ id, from, to, sourcePort?, targetPort?, label?,
  style? }`.
- **Value objects**: `Point {x,y}`, `Size {width,height}`,
  `ArchitectureEdgeStyle { path, line, color, animated, bidirectional }`.
- **Enums**: `ArchitectureNodeKind` (~220 membros — genéricos, cloud genérico,
  `aws-*`, `azure-*`, `gcp-*`, `oci-*`, `code-*`, `flow-*`, `algorithm-*`…);
  `ArchitectureEdgePath` (`smoothstep`); `ArchitectureEdgeLineStyle`
  (`solid|dashed|dotted`); `ArchitectureEdgePortSide` (`left|right|top|bottom`).

### 4.2 Funções puras e invariantes

- **Factories/transforms**: `createEmptyArchitecture`, `normalizeTitle`,
  `renameArchitecture`, `replaceArchitectureCanvas`, `normalizeArchitecture`.
- **Validação** (`validateArchitecture`) agrega:
  - versão == 1; `id`/`title` não vazios;
  - limites: **MAX_NODE_COUNT 1500**, **MAX_EDGE_COUNT 4000**, title ≤180,
    description ≤4000, mermaidSource ≤200000, ≤60 props/nó, ≤20000 props totais;
  - ids únicos (nós e arestas);
  - `parentId` referencia nó existente e **hierarquia acíclica**;
  - arestas `from`/`to` referenciam nós existentes.
- **Normalizadores privados**: `normalizeNode` (size mín 120×72, cor default
  `#f8fafc`), `normalizeEdge`/`normalizeEdgeStyle` (cor default `#111827`,
  `solid`), sanitização de texto (strip de control chars + clamp).

### 4.3 Interchange

- **`share-package.ts`**: `ArchitectureSharePackage { schema:"arch-draw.share",
  version: 1, exportedAt, architecture }`; `createSharePackage` /
  `parseSharePackage` (type-guard + normalize + validate). Envelope é o
  **contrato de fio** de import/export.
- **`mermaid.ts`**: `architectureFromMermaid`, `architectureToMermaid`,
  `parseConnections` + heurísticas de inferência de kind/cor e auto-layout em
  grade.

### 4.4 Consumo

Tanto `apps/api` quanto `apps/web` importam via specifier `@arch-draw/domain`.
O documento (e o share-package) é o contrato entre web e api: a API
valida/normaliza no save/import/export; o web mapeia documento ↔ view models do
editor.

## 5. Backend (`apps/api`)

### 5.1 Stack e boot

Fastify 5 (`@fastify/cors`), Node 22 ESM. `main.ts` carrega `.env` →
`loadConfig()` → `createServer(config)` → `listen({host,port})`.
`server.ts` é o _composition root_: instancia Fastify (body 2 MB, timeouts 10 s,
`trustProxy`), conecta Redis opcional, monta rate limiter, Google auth,
repositório comprimido (`makeCompressedArchitectureRepository(storagePath)`),
hub de colaboração in-memory e provider AWS; registra CORS, rotas e hooks.

### 5.2 Camadas

- **`application/contracts` (ports)**: `ArchitectureRepository`
  (`findAll/findById/save/deleteById` + share ops), `Clock` (`systemClock`),
  `IdGenerator` (`cryptoIdGenerator`), `CloudInventoryProvider`.
- **`application/use-cases`** (`makeX(deps)` → callable):
  `create/read/list/save/delete-architecture`, `export/import-architecture`
  (share-package; import re-IDs + `normalizeArchitecture` + `validateArchitecture`
  antes de persistir), `discover-cloud-architecture` (snapshot AWS →
  `ArchitectureDocument`).
- **`http`**: `routes.ts` (endpoints + sanitização de input),
  `google-auth.ts`, `csrf-protection.ts`, `session-token.ts`, `cookies.ts`,
  `request-rate-limiter.ts`, `security-observability.ts`,
  `realtime/collaboration-hub.ts`.
- **`infra`**: `compressed/*` (repositório + codec Brotli + `middle-out`),
  `aws/aws-cloud-inventory-provider.ts`, `redis/redis-client.ts`.
- **`config`**: `env.ts`, `dotenv.ts`.

### 5.3 Superfície HTTP

| Método | Rota | Propósito |
|---|---|---|
| GET | `/health` | `{ ok: true }` |
| GET | `/security/metrics` | contadores de segurança (token) |
| GET | `/architectures` | lista sumários da sessão |
| POST | `/architectures` | cria (title≤180, description≤4000) → 201 |
| GET | `/architectures/:id` | lê (400/404) |
| PUT | `/architectures/:id` | salva (body.id == route.id) |
| DELETE | `/architectures/:id` | remove (204/404) |
| GET | `/architectures/:id/export` | share package `.archdraw.json` |
| POST | `/architectures/import` | importa share package (201) |
| POST | `/architectures/:id/share` | cria/retorna link (`edit`/`read-only`) |
| GET | `/architectures/shared/:shareId` | doc compartilhado + accessMode (sem sessão) |
| PUT | `/architectures/shared/:shareId` | salva via share (403 se read-only) + broadcast |
| POST | `/architectures/shared/:shareId/cursor` | publica cursor (204) |
| POST | `/architectures/shared/:shareId/view` | publica viewport (204) |
| GET | `/architectures/shared/:shareId/events` | **stream SSE** |
| POST | `/cloud/aws/discover` | discovery AWS via roleArn → cria arquitetura |
| GET | `/auth/session` · `/auth/google/start` · `/auth/google/callback` · POST `/auth/logout` | auth |

**Pipeline de request (hooks)**: `onSend` aplica headers de segurança (CSP
`default-src 'none'`, `X-Frame-Options: DENY`, HSTS em https, remove `Server`).
`onRequest`: allowlist de host → garante cookie CSRF → valida CSRF em mutações →
gate de metrics token → rate limit por IP (429); depois, se OAuth habilitado,
exige autenticação em `/architectures*` e `/cloud*`. `setErrorHandler` mapeia
415/413/500.

### 5.4 Segurança / auth

- **Sessão** (`session-token.ts`): cookie `archdraw_session` (HttpOnly,
  SameSite=Lax, 1 ano). Com `SESSION_TOKEN_SECRET` os tokens são
  `uuid.HMAC-SHA256(uuid)` verificados por request; é a **chave de posse** de
  arquiteturas/shares (todas as queries do repositório são escopadas por ela).
- **CSRF** (`csrf-protection.ts`): double-submit cookie `archdraw_csrf`
  (legível por JS) + header `x-csrf-token` (compare timing-safe) + validação de
  `Origin`/`Referer` contra `WEB_ORIGINS`. Isenções: `/auth/google/*`,
  `/health`, `/security/metrics`.
- **Google OAuth** (`google-auth.ts`, opcional): habilitado só com
  `CLIENT_ID`/`SECRET`/`REDIRECT_URI`. `state` (UUID) em mapa in-memory (TTL 10
  min) + cookie HttpOnly bound ao browser; callback troca code, exige
  `email_verified`, cria sessão auth (12 h) em Redis (`security:oauth:session:*`)
  ou in-memory, cookie `archdraw_auth`.
- **Rate limit**: sliding-window por IP (Redis ou in-memory);
  `RATE_LIMIT_WINDOW_MS=60000`, `MAX_REQUESTS=240`.

### 5.5 Colaboração em tempo real

- **Transporte**: **SSE** (`GET …/events`) — handler faz `reply.hijack()`,
  emite `snapshot` inicial, faz forward de eventos e envia `: ping` a cada 15 s;
  `close` → `leave()`.
- **Modelo**: in-memory, **salas por `shareId`** (`RoomState`: participants,
  listeners SSE, `currentView`). Publicação por HTTP (cursor/view/document) faz
  fan-out como eventos `cursor|view|document|presence`.
- **Limites**: 200 participantes/sala, TTL de presença 60 s, salas vazias
  descartadas. **Single-process/in-memory** — não escala horizontalmente (dívida
  conhecida).

### 5.6 Persistência (`infra/compressed`)

- **Sem banco.** Filesystem em `config.storagePath` (default
  `./data/arch-draw.store`).
- **Formato**: diretório com `manifest.json` + packs Brotli `pack-NNNN.adpk`
  (≤1000 registros). Registros são NDJSON (`architecture` | `share`).
- **Codec** (`compressed-pack-codec.ts`): container `ADPK1` (magic + versão +
  settings + Brotli `BROTLI_MODE_TEXT`), **sem dicionário** (portável entre Node
  majors; legado ainda decodável + migração one-time). Teto de 64 MB
  descomprimido contra _decompression bombs_.
- **Manifest/index**: lista packs com ids/tokens, **Bloom filter** de 256 B por
  pack (pré-filtro de busca), `contentHash`/`compressedBytes` (skip de packs
  imutáveis).
- **Durabilidade**: write temp + `rename` atômico; manifest commitado por último;
  LRU de 24 packs decodificados. `findRecord` varre candidatos via
  `middleOutIndices` (pivô para fora); posse por `sessionToken`; colisão de id
  entre sessões re-sufixa o id.

### 5.7 Config / env

`loadConfig()` lê (defaults): `API_HOST`(127.0.0.1)/`API_PORT`(8080),
`ARCH_DRAW_STORAGE_PATH`, `WEB_ORIGINS`, `TRUST_PROXY(_HOPS)`,
`FORCE_SECURE_COOKIES`, `SESSION_TOKEN_SECRET`, `SECURITY_METRICS_TOKEN`,
`CSRF_COOKIE_NAME`/`CSRF_HEADER_NAME`, `ALLOWED_HOSTS`, `REDIS_URL` (opcional),
`GOOGLE_OAUTH_*`, `AUTH_POST_LOGIN_REDIRECT`, `RATE_LIMIT_*`. **Sem Doppler.**
Credenciais AWS não vêm de env (role via STS).

## 6. Frontend (`apps/web`)

### 6.1 Shell e bootstrap

- `main.ts`: `bootstrapApplication(AppComponent, provideZonelessChangeDetection())`.
  **Sem router** — a "navegação" para docs compartilhados lê o `shareId` da URL.
- `AppComponent` (~11k linhas, standalone, `OnPush`): shell único do editor.
  **Raiz detached** após init; repaint dirigido por `RenderScheduler`
  (rAF-coalesced) chamando `detectChanges()`.
- **Stores** (root, baseados em **signals**): `SelectionStore`, `CameraStore`,
  `EditingStore`, `InteractionStore`.

### 6.2 Motor do canvas (estado atual)

Detalhe completo em `engine-roadmap.md` e na seção 11 deste doc. Resumo:

- **Render híbrido**: nós = `<div>` (um `app-canvas-node` OnPush por nó);
  arestas = uma camada `<svg>` com `<path>` por aresta (+ hit path,
  overlays, labels em `<foreignObject>`).
- **Posição**: `translate3d` via CSS vars (`--node-x/--node-y`), viewport único
  com `translate(pan) scale(zoom)`.
- **Boundaries isolados** em `src/engine/`: `camera`, `spatial` (índice em
  grade), `selection`, `interaction`, `connector`, `render`
  (`render-model` + `render-scheduler`), `scene`, `history`.
- **Roteamento de arestas**: ortogonal com desvio de obstáculos; worker
  (`edge-routing.worker.ts`) só para refinamento em grafos complexos.
- **Dívida**: monólito de 11k linhas, `detectChanges` de árvore inteira por
  frame, muitos getters de template segurados por **27 Maps de cache manuais**;
  DOM+SVG não escala → heurísticas de degradação (`lite mode`, suspensão de
  arestas, `stress windows`).

### 6.3 Features (`src/features/`)

- **`import/diagram-import.ts`**: `parseImportToSharePackage()` — detecção por
  extensão + sniff (cap 5 MB). Formatos: **draw.io** (mxGraph XML, ~50 kinds AWS
  por ícone, nesting por geometria), **Excalidraw** (shapes/arrows + bindings +
  `customData`), **Mermaid** (`architectureFromMermaid` + metadados de layout ou
  auto-layout por direção), **nativo** (`.archdraw`). Sanitização forte
  (anti prototype-pollution).
- **`export/diagram-export.ts`**: serializers puros para Mermaid (+ metadados
  round-trip), draw.io (swimlanes/flow shapes) e Excalidraw (v2 + customData).
- **`interchange/mermaid-layout-metadata.ts`**: embute/lê geometria em
  comentários Mermaid (round-trip sem perda de layout).
- **`i18n/ui-translations.ts`**: `UiLanguage = "pt-BR" | "en-US"`; dicionários
  flat; `t()`/interpolador no componente (fallback pt-BR → chave).
- **`onboarding/tutorial-guides.ts`**: tours guiados com `targetSelector`
  (`[data-tour='…']`) e progressão de passos.
- **`editor/`**: stores + catálogos — `node-catalog.ts` (templates por
  categoria), `node-icons.ts` (FontAwesome), `node-property-fields.ts` (forms de
  propriedade por kind), `node-layout.ts` (geometria pura), `code-language.ts`
  (linguagens + detecção heurística), `mermaid-editor.ts`.
- **`collaboration/cursor-publish-policy.ts`**: throttle de cursor (tempo/pixel).
- **`auth/auth-session-state.ts`**: reducers puros de `AuthViewState`.

### 6.4 Editor de código

`code-editor.component.ts` — wrapper de **CodeMirror 6** lazy-loaded (chunk
carregado só ao expandir um bloco). Edita snippets **dentro de nós**
(`code-*`). Linguagens: python/js/ts/nodejs/sql/markdown/mermaid/yaml/go/rust/
java/elixir; one-dark, fold, autocomplete, **Vim mode**; `Compartment`s para
hot-swap de linguagem/read-only.

### 6.5 Persistência, autosave e colaboração (frontend)

- **Backend é a fonte de verdade** (diagramas não vão para localStorage).
  `api/client.ts`: CRUD + export/import + `discoverAwsArchitecture`.
  `API_BASE_URL` = `localhost:8080` em dev, senão `${origin}/api`.
  `credentials:"include"` + CSRF header em mutações.
- **Autosave**: `markViewChanged()` em toda mutação; `scheduleAutoSave()` com
  **debounce adaptativo por complexidade** (~2.2s/3.2s/4.5s conforme
  150/500/1200 nós+arestas); `persistCurrent()` usa assinatura para pular
  no-op; single-flight.
- **Colaboração**: `EventSource` (SSE) em `…/events?clientId=`; eventos
  `presence|cursor|document|view`. Publicação: `saveSharedArchitecture`
  (debounce 220 ms), `publishSharedCursor` (gated), `publishSharedView`. Em
  sessão colaborativa o autosave local é desabilitado.
- **localStorage** só para preferências/viewport (`arch-draw.ui-theme`, idioma,
  visibilidade de painéis, checkpoints de viewport por id, clientId).

### 6.6 Theming e i18n

`isDarkMode` derivado de `uiTheme` (`light|dark`), aplicado via classe no root
(`theme-dark`); estilos em `styles/base/04-theme-dark.css`. Dark mode também
altera rendering do canvas. Idiomas: pt-BR (default) / en-US. Estilos globais em
`styles/base/00..06` (foundation, canvas-shell, nodes-icons, connections-panels,
theme-dark, responsive, mobile) + `fa-subset.css`.

## 7. Modelo de dados e contrato de fio

O `ArchitectureDocument` normalizado/validado é o contrato entre web e api. Fluxo
típico de save: web serializa view models → `ArchitectureDocument` → `PUT
/architectures/:id` → API `normalizeArchitecture` + `validateArchitecture` →
repositório comprimido. Import/export usa o `ArchitectureSharePackage` (envelope
versionado). Versões: documento `version: 1`, share-package `version: 1` — mudar
o schema exige bump coordenado + migração.

## 8. Build, deploy e infra

- **CI** (`.github/workflows/ci.yml`): triggers em `main`/`develop` e branches
  `feature|fix|refactor|chore|test|hotfix/**`; **um job `verify`** (Node 22,
  `npm ci` → `npm run verify` → `playwright install chromium` → **e2e smoke**).
  Perf e2e **não** roda em CI.
- **Docker** (`docker-compose.yml`, 3 serviços, hardened: `read_only`,
  `cap_drop: ALL`, `no-new-privileges`, tmpfs, `init`):
  - **web**: multi-stage → `nginx-unprivileged`; serve SPA + reverse proxy;
    host `127.0.0.1:8080` (único entrypoint público).
  - **api**: `node:22-alpine`, `CMD node apps/api/dist/main.js`, expõe **3333**
    (interno), volume `arch_draw_data` → `/app/data`, healthcheck `/health`.
  - **redis**: `7.2-alpine` com senha, sem persistência, `maxmemory 256mb`.
  - **nginx** (`docker/nginx.conf`): SPA `try_files … /index.html`;
    `location /api/ → proxy_pass http://api:3333/`; `limit_req rate=20r/s`
    burst 40; CSP `default-src 'self'`, HSTS, gzip, cache imutável para hashed.
  - **Redes**: `edge` (bridge) + `backend` (`internal: true`); redis só no
    backend; browser só fala com nginx `/api/`.

## 9. Estratégia de testes

- **Unit (Vitest 4)**: `src/**/*.test.ts` (web exclui `e2e/`); domínio
  (`test/architecture.test.ts`); api (`test/*`: compressed repo/codec, dotenv,
  google-auth, save-architecture, session-isolation).
- **E2E (Playwright)**: `playwright.config.ts` smoke (`e2e/smoke.spec.ts`,
  serve build estático, `/api/**` stubbado, workers=1). Perf on-demand
  (`playwright.perf.config.ts`: `canvas-render.perf.ts`, `codemirror.perf.ts`,
  via `PERF_NODES`/`PERF_CODE`) — fora do gate de CI.
- **Gate**: `npm run verify` (typecheck → "lint"/compile → test → build) + smoke.

## 10. Decisões técnicas e trade-offs (ADR resumido)

| ADR | Decisão | Trade-off aceito |
|---|---|---|
| 1 | Domínio puro como contrato de fio | Duplicação de mapeamento view↔domínio no web |
| 2 | Persistência filesystem Brotli (sem DB) | Não escala multi-instância; simplicidade e portabilidade |
| 3 | Colaboração SSE in-memory | Sem escala horizontal; operação simples |
| 4 | Angular zoneless + scheduler próprio | Repaint 100% manual (31 sites de `requestViewRender`) |
| 5 | Canvas híbrido DOM+SVG | HTML rico nos nós, mas muralha de performance |
| 6 | "Lint" = compile TS, sem ESLint | Menos regras de estilo; menos setup |

## 11. Rewrite do motor do canvas (Fase 2)

### 11.1 Motivação

Ver diagnóstico em `engine-roadmap.md`. Dois bugs visuais já corrigidos in-place
(recuperação de render pós-navegação; clamp de z da camada de arestas). A muralha
estrutural permanece: DOM+SVG não escala + monólito de 11k linhas + caches
manuais no lugar de reatividade.

### 11.2 Decisões (confirmadas)

- **Render híbrido**: **Canvas/WebGL** para arestas (+ grade) e **DOM
  virtualizado** para nós (só os visíveis; preserva CodeMirror/HTML/edição
  inline).
- **Transição strangler**: motor novo isolado atrás de flag (`engine=v2`),
  migrando fatia por fatia com o legado funcionando até o corte.
- **Reatividade fina**: substituir os 27 Maps por signals/computed.
- **Ordem persistida**: adicionar campo de ordem/`zIndex` ao
  `ArchitectureNode` no domínio (resolve z-order por construção e habilita
  "trazer para frente/enviar para trás") — exige **bump de
  `ARCHITECTURE_DOCUMENT_VERSION`** e do share-package + migração +
  `normalizeNode`/validação estendidas.

### 11.3 Interfaces alvo (esboço)

```
// Modelo de cena desacoplado do Angular
interface SceneModel { nodes: SceneNode[]; edges: SceneEdge[]; }
interface Renderer {
  mount(host: HTMLElement): void;
  render(scene: SceneModel, camera: Camera): void;   // por frame (rAF)
  hitTest(pointWorld: Point): HitResult | null;
  dispose(): void;
}
// Implementações: DomNodeRenderer (virtualizado) + CanvasEdgeRenderer (2D/WebGL)
```

### 11.4 Fatias (cada uma = 1 PR para `develop`)

| # | Fatia | Entrega |
|---|---|---|
| 0 | Fundação | Campo de ordem no domínio (+ bump versão/migração), interfaces `SceneModel`/`Renderer`, flag `engine=v2` |
| 1 | Nós (DOM virtualizado) | Render só de nós visíveis; signals no lugar dos caches; mantém HTML/CodeMirror/flow-shapes |
| 2 | Arestas (Canvas/WebGL) | Camada `<canvas>` sobreposta; z-order correto por construção; roteamento 100% no worker |
| 3 | Interação | Drag/resize/pan/marquee/connection sobre spatial-index **incremental** (sem rebuild total) |
| 4 | Cutover | `v2` por padrão; remoção do caminho legado do canvas do monólito |

### 11.5 Riscos do rewrite

- **Regressão de features** ao migrar (export, edição inline, colaboração): cada
  fatia sai atrás de flag e com verificação visual antes do corte.
- **Migração de versão do documento**: escrever migração idempotente e testar
  round-trip com documentos v1 existentes.
- **Paridade visual** (estilo hand-drawn, markers, labels) no renderer Canvas:
  validar por Playwright perf/visual antes do cutover.
