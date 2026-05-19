# Arch Draw

Arch Draw é um editor visual de diagramas de arquitetura e fluxo de software.

Ele combina modelagem visual por drag and drop com importação/exportação Mermaid, permitindo sair de uma visão macro (cloud, rede, domínio) para uma visão micro (serviços, código, dados e relações) no mesmo board.

## O que o projeto entrega

- Canvas interativo para desenhar arquiteturas completas.
- Login opcional com Google SSO para proteger o workspace e isolar acesso.
- Biblioteca de blocos para cloud, software, Kubernetes, algoritmos, bancos e integrações.
- Conexões avançadas entre elementos com estilos, direções e roteamento progressivo com desvio de obstáculos.
- Curvas de conexão respeitam os mesmos obstáculos do roteamento; quando uma curva invadir um elemento, o canto é mantido reto.
- A área de contato das âncoras atua como escudo invisível de roteamento, mantendo conexões por fora do elemento mesmo quando os controles não estão visíveis.
- Drag de conexão iniciado em âncora mantém preview e alvo travado na porta destacada, evitando conexão acidental em outro elemento no drop.
- Rotas de conexão são revalidadas contra obstáculos atuais do canvas e reajustadas quando novos elementos passam a cruzar uma linha existente.
- Reparação final de rotas corrige colisões residuais após restrições de âncora, mantendo tolerância apenas no segmento terminal do próprio elemento.
- Desvio de conexões percorre todos os segmentos da linha, inclusive após curvas, até contornar múltiplos obstáculos no mesmo caminho.
- Conexão reversa entre dois elementos reaproveita a linha já desenhada e apenas promove o fluxo para bidirecional, sem criar segunda linha SVG sobreposta.
- Setas de conexão ancoradas pela borda externa da bolinha de contato (apenas lados esquerdo/direito), com ponta da seta na bolinha e linha terminando no centro traseiro da seta.
- Em conexões múltiplas no mesmo ponto, as âncoras se unificam na bolinha de contato e só abrem afastamento no percurso, com tronco comum simétrico na origem e no destino.
- Áreas de clique das portas de conexão calibradas para maior precisão: gesto na direção da porta inicia vínculo, enquanto o drag de elementos minimizados inicia apenas sobre o ícone do elemento.
- Âncoras de conexão mantêm prioridade de clique sobre controles de resize quando o elemento está selecionado.
- Quando há conexão em ambos os sentidos entre dois nós, o diagrama reaproveita a linha existente como fluxo bidirecional ping-pong, com seta de entrada e saída, sem duplicar linhas.
- Ao tentar conectar novamente dois elementos que já possuem vínculo direcional, o vínculo existente é promovido para bidirecional.
- Camadas visuais por hierarquia de container (filhos sempre acima do container pai), sem elevar z-index apenas por foco de clique.
- Quando um bloco de código está expandido, ele recebe precedência de camada sobre irmãos no mesmo contexto para evitar sobreposição visual do conteúdo aberto.
- Supressão automática de linhas de conexão que encostam na área de contato durante drag and drop, com área visível para elementos minimizados/maximizados (inclusive dentro de containers) e sem ativação por foco/clique/abertura.
- Ao criar conexões com containers abertos, o alvo visual usa o perímetro do container como barreira de contato em vez do indicador circular de proximidade.
- Labels de âncoras exibidos em caixa horizontal fixa (sem seguir ângulo da linha e sem quebra de palavra), com fundo transparente e blur forte atrás do texto para preservar leitura sem caixa opaca; em cenários de alta carga, o blur e efeitos de sombra são reduzidos automaticamente para priorizar fluidez.
- Estilo de conexão `smoothstep` com curvas suaves contínuas para leitura de fluxo.
- Elementos expansíveis/minimizáveis para navegar entre níveis de detalhe.
- Ícones de elementos minimizados mantêm alinhamento central mesmo com labels longas.
- Elementos de código minimizados exibem badge da linguagem detectada, atualizada sempre que o conteúdo interno muda, para facilitar identificação rápida do conteúdo.
- Containers não expandem automaticamente durante drag and drop; ajuste dinâmico ocorre apenas em fluxos de expansão/maximização.
- Ao carregar/criar exemplos e importar arquiteturas, filhos de container que encostariam no header são reposicionados em bloco (preservando espaçamento relativo) para manter tipo/título editável sempre livres.
- Colapso de elementos aninhados com manutenção do foco visual no canvas e redução de ruído em labels agregadas.
- Normalização automática de vínculo em containers ao carregar/importar templates (nós internos sem `parentId` válido são reanexados ao container correto pelo contexto visual).
- Exclusão em cascata para hierarquias: ao remover um container/pai, todos os itens internos (filhos e descendentes) também são removidos, independentemente de estado minimizado/maximizado.
- Blocos que suportam conteúdo técnico (código, YAML, SQL, Mermaid e configurações).
- Para manter criação/importação fluida em boards grandes, snippets padrão de nós de infraestrutura são materializados sob demanda (na edição), em vez de persistidos em massa na criação do exemplo.
- Em arquiteturas mais densas, o roteamento de linhas usa modo adaptativo (consulta de obstáculos reduzida + janela maior de fast-route ao expandir/criar exemplos) para manter navegação e abertura de containers mais fluida.
- Em zoom baixo com alta densidade, labels/knockouts de conexões e overlays de contexto em dark mode são reduzidos temporariamente para priorizar FPS durante navegação.
- Exportação de diagramas em múltiplos formatos (`.archdraw.json`, `.drawio`, `.excalidraw`, `.mmd`, SVG e PNG).
- Importação de diagramas em múltiplos formatos (`.archdraw`, JSON, `.drawio`/XML, `.excalidraw`, `.mmd`/`.mermaid`).
- Import mantém hierarquia visual e fluxo entre plataformas (draw.io, Excalidraw e Mermaid), convertendo para tipos internos sem desmontar a estrutura original.
- Export `.mmd` inclui metadado interno de layout; ao reimportar esse Mermaid no Arch Draw, posições, hierarquia de containers e estilos de conexão são restaurados com fidelidade.
- Painel de propriedades contextual no ponto do clique, com ajustes globais de fonte de labels, fonte de âncoras e tamanho de ícones.
- Compartilhamento por arquivo com link dedicado (`?share=...`) e modo de acesso controlado no servidor (`edit` ou `read-only`), sem expor permissão no URL.
- Persistência backend em pacotes locais comprimidos (`.adpk`) com manifest de busca por sessão, arquivo e share, sem dependência de banco relacional para salvar arquiteturas.
- Presença em tempo real no canvas com cursor dos colaboradores, sincronização de edições e sincronização de visão (zoom/pan/foco em elemento maximizado) entre participantes, inclusive para convidados em `read-only`.
- Botão Tutorial com guias feature por feature (containers, conexões, área de contato, propriedades, zoom, atalhos e fluxo de import/export), em modo guiado por passo com foco visual e avanço condicionado ao clique no alvo destacado quando aplicável.
- Tooltips de ajuda/indicação com largura adaptativa (`fit-content`) e limite de viewport para evitar overflow visual do texto.
- Tooltips e labels de conexão com espaçamento interno reforçado para evitar texto encostado nas bordas.
- Abertura padrão do board com viewport centralizado no conteúdo em 27% de zoom quando não existe checkpoint salvo.
- Checkpoint automático de viewport por arquivo (zoom + posição do canvas), retomando no mesmo ponto após recarregar ou reabrir o navegador.
- Navegação do canvas por gesto de dois dedos no touchpad, mantendo `Ctrl/Command + scroll` para zoom.
- Pan, zoom e preview de conexão preservam caches de rotas, paths SVG, labels, retângulos, estilos e identidade das listas do canvas, com renderização limitada à área visível e persistência agrupada durante navegação para reduzir travamentos em diagramas densos.
- Culling de viewport e redução de detalhes visuais são adaptativos durante navegação/interação (pan, drag, resize e mini map), reduzindo custo de render em boards densos e mantendo o fluxo funcional.
- Durante navegação contínua em diagramas densos (pan/zoom/minimap), o render de arestas entra em janela curta de alívio e o minimap prioriza containers/seleção para manter fluidez sem perder orientação.
- Expansão de estruturas aninhadas reutiliza índice de nós, posições absolutas, profundidade de hierarquia e visibilidade de ancestrais para reduzir buscas repetidas em containers grandes.
- Zoom ampliado de 5% a 500% para navegar arquiteturas maiores sem perder detalhamento.
- Toasts visuais no padrão da plataforma para ações de produtividade (salvar checkpoint, exportar e limpar).
- Interface com i18n completo `PT/EN` (PT-BR e EN-US), incluindo toolbar, telas de autenticação, painel de propriedades, status, toasts e conteúdo dos tutoriais guiados.
- Menu lateral esquerdo (arquivos + blocos) com toggle de ocultar/exibir para ampliar a área útil do canvas, com preferência persistida por usuário no navegador.
- Lista de arquivos com quebra de linha controlada e truncamento com `...` para manter cards consistentes com títulos/metadados longos.
- Otimização de entrega web com compressão HTTP (`gzip`), cache imutável para assets hashados e `index.html` sem cache.
- Auto save com debounce adaptativo por complexidade (nós + conexões) para reduzir carga em arquiteturas grandes.
- Isolamento por sessão para cada usuário ver apenas seus próprios arquivos e template.
- Menu `Exemplos` na toolbar com templates prontos de arquitetura (completo macro→micro, AWS cross-account, cluster Kubernetes, software platform, AWS serverless SaaS, AWS data platform e software microservices).

## Casos de uso

- Documentar arquitetura de sistemas distribuídos.
- Mapear topologia cloud (VPC, subnets, gateways, balanceadores, filas, banco, cache).
- Representar fluxos de desenvolvimento e decisões com shapes de flow diagram.
- Relacionar infraestrutura, componentes de aplicação e trechos de código no mesmo diagrama.
- Criar diagramas compartilháveis para revisão técnica, handoff e documentação.

## Experiência principal

1. Adicione blocos pela barra lateral (clique ou arraste).
2. Organize em containers para agrupar domínios, ambientes ou contextos.
3. Conecte elementos com setas e rótulos de relacionamento.
4. Abra o popup de propriedades para ajustar tipo, cor, campos técnicos e estilos globais.
5. Minimize/maximize containers e snippets de código para navegar em arquiteturas grandes.
6. Exporte em Arch-Draw, Draw.io, Excalidraw, Mermaid, SVG ou PNG.
7. Clique em `Compartilhar` e escolha `Link com edição` ou `Link somente leitura` para copiar o link colaborativo no modo desejado.
   A permissão é validada no backend e não depende de parâmetro de modo na URL.
   Se uma URL antiga contiver `mode/accessMode/shareMode`, o app remove esses parâmetros automaticamente ao abrir.

Atalhos de edição:

- `Ctrl/Cmd + Z`: desfaz alterações recentes.
- `Ctrl/Cmd + A`: seleciona todos os nós no board (independente da camada visual/z-index).
- `Ctrl/Cmd + S`: salva as alterações atuais.
- `Delete/Backspace`: remove seleção atual (nó/linha).

## Stack

- Monorepo com npm workspaces
- Frontend: Angular + TypeScript
- Renderização: Canvas/SVG customizado + Mermaid
- Backend: Node.js + Fastify + TypeScript
- Núcleo de domínio compartilhado em `packages/domain`

## Rodando localmente

```bash
npm install
npm run dev
```

## Estrutura de estilos (CSS)

O frontend mantém um ponto de entrada único em `apps/web/src/styles/base.css`, agora organizado por módulos para reduzir complexidade e facilitar manutenção:

- `apps/web/src/styles/base/00-foundation.css`: reset, shell, topbar, sidebar e palette.
- `apps/web/src/styles/base/01-canvas-shell.css`: canvas, viewport, marquee e cursores remotos.
- `apps/web/src/styles/base/02-nodes-icons.css`: nós, variações visuais e ícones.
- `apps/web/src/styles/base/03-connections-panels.css`: portas/conexões, minimap e painéis.
- `apps/web/src/styles/base/04-theme-dark.css`: overrides do tema escuro.
- `apps/web/src/styles/base/05-responsive.css`: regras responsivas.

A ordem dos módulos preserva o cascade anterior.

## Estrutura de código (editor)

Para reduzir complexidade do frontend, a lógica do editor vem sendo extraída para módulos puros em `apps/web/src/features/editor/`.

Exemplo recente:

- `node-layout.ts`: concentra cálculos puros de layout (métricas de portas, tamanho dinâmico de ícone minimizado e truncamento de labels minimizadas).
- `node-layout.test.ts`: cobre os comportamentos principais dessa lógica para proteger contra regressão.

URLs padrão:

- Web: `http://127.0.0.1:5173`
- API: `http://localhost:8080`

## Rodando com Docker

```bash
docker compose up --build
```

Modo seguro para servidor compartilhado (recomendado):

- Apenas a interface web é publicada no host e fica limitada a loopback (`127.0.0.1:8080`).
- API e Redis rodam sem `ports` públicas e ficam acessíveis apenas por rede interna do Compose.
- A rede `backend` é `internal`, impedindo acesso externo direto aos serviços internos.
- Containers usam `no-new-privileges`, limites de PIDs e filesystem `read_only` com `tmpfs` apenas nos caminhos necessários.
- `web` roda com Nginx não-root e porta interna não privilegiada (`8080`).
- Sessões OAuth e rate-limit usam Redis com expiração (TTL), reduzindo risco de bypass entre réplicas.
- Requisições mutáveis exigem CSRF token (`double-submit cookie`) e validação de `Origin/Referer`.
- API pode validar `Host` por allowlist (`ALLOWED_HOSTS`) para reduzir ataques de host header injection.
  O healthcheck interno da API usa o primeiro host dessa lista para validar `/health` dentro do container.
- Nginx aplica `client_max_body_size`, timeouts curtos e limitador de burst em `/api`.

Hardening obrigatório no host:

1. Não exponha Docker API em TCP. Deixe apenas o socket local Unix.
2. Aplique firewall padrão `deny incoming` e libere somente as portas realmente necessárias do reverse proxy.
3. Use segredo forte em `REDIS_PASSWORD` e rotacione credenciais OAuth antes de produção.

Exemplo de `daemon.json` (host Linux):

```json
{
  "hosts": ["unix:///var/run/docker.sock"],
  "icc": false,
  "live-restore": true,
  "userland-proxy": false,
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

Após alterar o daemon:

```bash
sudo systemctl daemon-reload
sudo systemctl restart docker
```

Exemplo de firewall com UFW:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

## Scripts úteis

```bash
npm run typecheck
npm run build
npm run lint
npm test
npm run verify
```

`npm run verify` executa o gate completo de integridade local (`typecheck`, `lint`, `test` e `build`) no mesmo padrão da pipeline CI.

## Estrutura do monorepo

```text
packages/domain
  Tipos, regras de validação e contratos centrais do diagrama.

apps/api
  Casos de uso, rotas HTTP e persistência.

apps/web
  UI, canvas, propriedades e import/export.
```

## Configuração

Se precisar sobrescrever host, porta ou origens permitidas:

```bash
cp .env.example .env
```

Variáveis relevantes de autenticação e segurança:

- `TRUST_PROXY` e `TRUST_PROXY_HOPS` para respeitar `x-forwarded-proto` atrás de proxy de forma restrita.
- `ALLOWED_HOSTS` para allowlist de hostnames aceitos no header `Host` (ex.: `app.exemplo.com,localhost`).
  A primeira entrada também é usada no healthcheck interno da API no Docker.
- `FORCE_SECURE_COOKIES=true` em produção para forçar cookies `Secure` independentemente do protocolo percebido.
- `SECURITY_METRICS_TOKEN` para proteger `GET /security/metrics`.
- `CSRF_COOKIE_NAME` e `CSRF_HEADER_NAME` para política de CSRF (default: `archdraw_csrf` + `x-csrf-token`).
- `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS` e `RATE_LIMIT_MAX_ENTRIES` para hardening de rate-limit.
- `REDIS_URL` para sessão OAuth e rate-limit distribuído com expiração.
- `ARCH_DRAW_STORAGE_PATH` para diretório local dos pacotes comprimidos de arquiteturas (default: `./data/arch-draw.store`).
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` para habilitar SSO Google.
- `AUTH_POST_LOGIN_REDIRECT` para definir rota padrão após login.
- `REDIS_PASSWORD` para proteger o Redis interno no ambiente Docker (quando `REDIS_URL` usa senha).

Quando as três variáveis `GOOGLE_OAUTH_*` estiverem definidas, a API passa a exigir autenticação para rotas de arquitetura (`/architectures...`) e o frontend exibe a tela de login.

Se a validação inicial de sessão (`GET /auth/session`) falhar por indisponibilidade da API, CORS, host não permitido ou configuração OAuth inválida, o frontend libera a tela de login e exibe a falha em vez de permanecer indefinidamente no estado de validação SSO.

Para desenvolvimento local com `npm run dev` (`web` em `127.0.0.1:5173` e API em `localhost:8080`), use callback OAuth direto na API:

```env
WEB_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8080/auth/google/callback
```

A mesma URL definida em `GOOGLE_OAUTH_REDIRECT_URI` precisa estar cadastrada em **Authorized redirect URIs** no OAuth Client do Google Cloud. Se o Google retornar `redirect_uri_mismatch`, cadastre exatamente `http://localhost:8080/auth/google/callback` ou ajuste a variável para uma URL já autorizada.

A API carrega automaticamente o arquivo `.env` local ao iniciar por `npm run dev`, sem sobrescrever variáveis já exportadas no ambiente.

Para desenvolvimento com Docker Compose (`web` em `localhost:8080`), use callback OAuth no proxy web:

```env
WEB_ORIGINS=http://localhost:8080,http://127.0.0.1:8080
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8080/api/auth/google/callback
```

Exemplo recomendado para produção em `archdraw.com.br`:

```env
WEB_ORIGINS=https://archdraw.com.br,https://www.archdraw.com.br
ALLOWED_HOSTS=archdraw.com.br,www.archdraw.com.br
GOOGLE_OAUTH_REDIRECT_URI=https://archdraw.com.br/api/auth/google/callback
FORCE_SECURE_COOKIES=true
```

No ambiente Docker, o Nginx do frontend envia `Cache-Control: no-store` (mais `Pragma`/`Expires`) para evitar cache de cliente e proxy durante rollout de versão.

## Licença

Este projeto está licenciado sob a MIT License. Consulte [LICENSE](./LICENSE).

## Copyright

Copyright (c) 2026 Substructa. Consulte [COPYRIGHT](./COPYRIGHT).
