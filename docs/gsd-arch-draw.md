# GSD — General Solution Design (arch-draw)

> Documento de desenho da solução em alto nível. Descreve o problema, os
> objetivos, o escopo, a visão da solução, as decisões estruturais e os
> requisitos não-funcionais do produto **arch-draw** como um todo.
>
> Complementa: [`sdd-arch-draw.md`](./sdd-arch-draw.md) (desenho técnico
> detalhado) e [`engine-roadmap.md`](./engine-roadmap.md) (migração incremental
> da engine do editor).

---

## 1. Visão geral

O **arch-draw** é um editor visual de arquiteturas de software e de nuvem,
baseado em navegador. Permite montar diagramas de sistemas (nós, containers
hierárquicos e conexões), documentar componentes com propriedades e trechos de
código, importar/exportar em múltiplos formatos, colaborar em tempo real via
link compartilhável e descobrir automaticamente a topologia de uma conta AWS.

O produto é um monorepo com três partes:

- **`packages/domain`** — núcleo de domínio puro (modelo, invariantes,
  interchange), sem dependência de framework.
- **`apps/api`** — backend Fastify que valida, persiste e compartilha
  documentos, além de autenticação e descoberta de nuvem.
- **`apps/web`** — SPA Angular (zoneless) com o editor de canvas, import/export,
  i18n, tutoriais e colaboração.

## 2. Problema e objetivos

### Problema

Ferramentas de diagramação genéricas (draw.io, Excalidraw) não entendem
semântica de arquitetura (tipos de recurso, hierarquia de containers,
propriedades de nuvem) e não fazem ponte com o estado real da infraestrutura.
Ferramentas de nuvem são presas a um provedor. Falta um editor que combine
**edição visual fluida**, **modelo de domínio rico e portável**, **interchange
sem perda** com os formatos populares e **colaboração leve**.

### Objetivos

- Editor de canvas rápido e direto, com hierarquia de containers e conexões
  roteadas.
- Modelo de domínio único, imutável e validável, que sirva de contrato entre
  frontend e backend e de formato de intercâmbio.
- Import/export sem perda com draw.io, Excalidraw, Mermaid e formato nativo;
  export de imagem (SVG/PNG).
- Colaboração em tempo real por link, com presença e cursores.
- Descoberta de arquitetura AWS a partir de uma role IAM.
- Postura de segurança forte (CSRF, sessão, OAuth opcional, headers, rate limit,
  containers endurecidos).
- Internacionalização (pt-BR / en-US) e tema claro/escuro.

### Não-objetivos (atual)

- Persistência multi-tenant em banco relacional/distribuído (hoje é filesystem
  local por processo).
- Colaboração horizontalmente escalável entre múltiplas instâncias (o hub é
  in-memory por processo).
- Descoberta de nuvem além de AWS (Azure/GCP/OCI existem como tipos de nó, mas
  não como discovery automatizado).

## 3. Escopo

| Dentro do escopo | Fora do escopo (por ora) |
|---|---|
| Edição visual de nós/containers/arestas | Versionamento/branching de diagramas |
| ~220 tipos de nó (genéricos, AWS/Azure/GCP/OCI, código, fluxo) | Editor colaborativo com CRDT/merge automático |
| Import/export drawio, excalidraw, mermaid, nativo, SVG, PNG | Export para Terraform/IaC |
| Colaboração em tempo real por link (SSE) | Escala horizontal do canal de colaboração |
| Descoberta AWS via role IAM | Discovery Azure/GCP/OCI |
| Auth anônima por sessão + Google OAuth opcional | RBAC/organizações/times |
| Persistência local comprimida (Brotli) | Banco gerenciado / réplica |

## 4. Personas e usuários

- **Arquiteto/engenheiro** desenhando e documentando sistemas.
- **Time** revisando um diagrama junto, em tempo real, por link.
- **Operação/DevOps** importando o estado real de uma conta AWS para visualizar.
- **Consumo programático**: o `ArchitectureDocument` (e o share-package) é um
  contrato estável, permitindo integração/automação.

## 5. Visão da solução

```
                    ┌─────────────────────────────────────────────┐
   Navegador        │  apps/web  (Angular 21, zoneless SPA)         │
                    │  ─ Editor de canvas (DOM + SVG híbrido)        │
                    │  ─ Stores por signals (selection/camera/…)     │
                    │  ─ Import/Export (drawio/excalidraw/mermaid…)  │
                    │  ─ i18n pt/en, tema, tutoriais, code editor    │
                    └───────────────┬─────────────────────────────┘
                                    │ HTTPS (cookies: sessão + CSRF)
                        nginx /api/ →│  (reverse proxy, CSP, rate limit)
                                    ▼
                    ┌─────────────────────────────────────────────┐
   Servidor         │  apps/api  (Fastify 5, Clean/Onion)           │
                    │  ─ http: rotas, auth, CSRF, rate limit, SSE   │
                    │  ─ application: use-cases + contracts (ports) │
                    │  ─ infra: repo comprimido (Brotli), AWS, redis│
                    └───────────────┬─────────────────────────────┘
                                    │ usa
                                    ▼
                    ┌─────────────────────────────────────────────┐
   Compartilhado    │  packages/domain  (@arch-draw/domain, puro)  │
                    │  ─ ArchitectureDocument / Node / Edge          │
                    │  ─ invariantes, validação, normalização        │
                    │  ─ share-package + mermaid interchange         │
                    └─────────────────────────────────────────────┘

   Persistência: filesystem (packs Brotli ADPK1) + volume Docker
   Colaboração: SSE in-memory por sala (shareId)
   Opcional: Redis (rate limit + sessões OAuth), AWS SDK (discovery)
```

O **domínio é o centro** e não depende de nada externo. As dependências apontam
para dentro (regra da Onion Architecture): `http → application → domain`, com a
`infra` implementando os contratos (ports) definidos em `application`.

## 6. Decisões-chave de solução

| # | Decisão | Motivo |
|---|---|---|
| D1 | Domínio puro compartilhado (`@arch-draw/domain`) como contrato de fio | Uma única fonte de verdade validável entre web e api; portabilidade e testabilidade |
| D2 | Backend Fastify com Clean/Onion (ports & adapters) | Baixo acoplamento, troca de infra sem tocar regra de negócio |
| D3 | Persistência em filesystem com packs Brotli (`ADPK1`) + Bloom filter | Zero dependência de banco; durável (write atômico); compacto; portável entre versões de Node |
| D4 | Frontend Angular **zoneless** com scheduler próprio (rAF) | Elimina overhead do Zone.js; repaint sob controle explícito |
| D5 | Colaboração via **SSE** (não WebSocket) por sala in-memory | Simplicidade operacional; unidirecional servidor→cliente + POST para publicar |
| D6 | Auth anônima por sessão (cookie) + Google OAuth **opcional** | Uso imediato sem login; SSO quando configurado |
| D7 | Interchange sem perda com metadados embutidos (Mermaid) | Round-trip export→import preservando layout |
| D8 | Segurança por padrão (CSRF double-submit, headers estritos, rate limit, containers read-only) | Postura defensiva desde o desenho |
| D9 | Canvas híbrido DOM (nós) + SVG (arestas) | Permite HTML rico/CodeMirror embutido nos nós |

## 7. Requisitos não-funcionais

- **Performance**: canvas deve permanecer fluido em diagramas grandes. Limites de
  domínio: **1500 nós / 4000 arestas**. Autosave com _debounce_ adaptativo por
  complexidade. (Ver §11 e o SDD para a muralha atual de performance.)
- **Segurança**: CSRF em toda mutação; sessão HttpOnly (HMAC opcional); OAuth com
  `state` bound ao browser; CSP `default-src 'none'` na API e `'self'` no nginx;
  rate limit por IP; containers `read_only` + `cap_drop: ALL`.
- **Portabilidade de dados**: documento versionado (`version: 1`) e share-package
  versionado; packs Brotli sem dependência de dicionário (portáveis entre Node).
- **i18n / acessibilidade**: pt-BR (default) e en-US; tema claro/escuro; layout
  responsivo/mobile.
- **Observabilidade**: contadores de eventos de segurança expostos por endpoint
  protegido por token.
- **Testabilidade**: domínio 100% testável; gate de CI único (`verify`) +
  Playwright smoke.

## 8. Restrições e premissas

- **Runtime**: Node 22 (ESM), TypeScript 5.8 estrito.
- **Sem banco de dados**: persistência é filesystem; um único processo é a fonte
  de verdade (colaboração e sessões in-memory não escalam horizontalmente sem
  Redis/broker — dívida conhecida).
- **Sem Doppler / sem ESLint**: envs via dotenv; "lint" é um compile TS. Manter
  assim salvo decisão explícita.
- **AWS discovery** assume role IAM fornecida pelo chamador (via STS); credenciais
  não vêm de env.

## 9. Riscos e mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Canvas "pesado" em diagramas grandes | UX degrada, jank | Rewrite incremental do motor (Fase 2, ver §11); modo lite/culling hoje |
| Colaboração in-memory não escala | Perde estado em restart / multi-instância | Documentado como não-objetivo; futura ponte Redis/broker |
| Monólito `app.component.ts` (~11k linhas) | Manutenção/regressão difíceis | Decomposição + signals no rewrite; boundaries já isolados na engine |
| z-order sem persistência no domínio | Sem "trazer para frente" e bugs de camada | Adicionar campo de ordem no domínio + bump de versão (Fase 2) |
| Perda de layout em interchange | Diagramas "quebram" ao reimportar | Metadados de layout embutidos (Mermaid) + customData (Excalidraw) |

## 10. Métricas de sucesso

- Canvas mantém interação fluida perto do limite de domínio (1500/4000).
- Round-trip import→export→import sem perda perceptível de layout.
- Zero regressão em segurança (CSRF/headers/rate limit) no gate de CI.
- Colaboração estável para salas até 200 participantes (limite atual do hub).

## 11. Evolução — rewrite incremental do motor do canvas

Direção estratégica já em andamento (ver `engine-roadmap.md`): extrair o motor do
editor do monólito para módulos isolados e migrar a renderização para um modelo
**híbrido** (Canvas/WebGL para arestas + DOM virtualizado para nós), via
abordagem **strangler** (troca fatia por fatia atrás de flag), preservando o
shell atual (auth, i18n, export, colaboração).

Objetivos do rewrite:

1. Remover a muralha de performance do DOM+SVG (1 componente por nó, 3–4
   elementos SVG por aresta) e as gambiarras de degradação associadas.
2. Corrigir por construção os bugs de camada (z-order) e de visibilidade de
   arestas, adicionando ordem/layer explícita ao domínio.
3. Substituir o sistema caseiro de 27 caches por reatividade fina (signals).

O desenho técnico detalhado das fatias, interfaces e migração de versão do
documento está no **SDD**, seção "Rewrite do motor do canvas".
