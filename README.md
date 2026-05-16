# Arch Draw

Arch Draw é um editor visual de diagramas de arquitetura e fluxo de software.

Ele combina modelagem visual por drag and drop com edição textual via Mermaid, permitindo sair de uma visão macro (cloud, rede, domínio) para uma visão micro (serviços, código, dados e relações) no mesmo board.

## O que o projeto entrega

- Canvas interativo para desenhar arquiteturas completas.
- Biblioteca de blocos para cloud, software, Kubernetes, algoritmos, bancos e integrações.
- Conexões avançadas entre elementos com estilos e direções configuráveis.
- Elementos expansíveis/minimizáveis para navegar entre níveis de detalhe.
- Blocos que suportam conteúdo técnico (código, YAML, SQL, Mermaid e configurações).
- Importação e exportação de diagramas em múltiplos formatos (incluindo `.archdraw.json`, SVG e PNG).
- Fluxo Mermaid com preview e aplicação no board sem perder o contexto existente.
- Isolamento por sessão para cada usuário ver apenas seus próprios arquivos e template.

## Casos de uso

- Documentar arquitetura de sistemas distribuídos.
- Mapear topologia cloud (VPC, subnets, gateways, balanceadores, filas, banco, cache).
- Representar fluxos de desenvolvimento e decisões com shapes de flow diagram.
- Relacionar infraestrutura, componentes de aplicação e trechos de código no mesmo diagrama.
- Criar diagramas compartilháveis para revisão técnica, handoff e documentação.

## Experiência principal

1. Adicione blocos pela barra lateral.
2. Organize em containers para agrupar domínios, ambientes ou contextos.
3. Conecte elementos com setas e rótulos de relacionamento.
4. Abra elementos que suportam código para detalhar implementação.
5. Use Mermaid para acelerar criação de estruturas grandes.
6. Exporte o resultado final para documentação ou compartilhamento.

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

URLs padrão:

- Web: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:3333`

## Rodando com Docker

```bash
docker compose up --build
```

## Scripts úteis

```bash
npm run typecheck
npm test
npm run build
npm run lint
```

## Estrutura do monorepo

```text
packages/domain
  Tipos, regras de validação e contratos centrais do diagrama.

apps/api
  Casos de uso, rotas HTTP e persistência.

apps/web
  UI, canvas, editor Mermaid, propriedades e import/export.
```

## Configuração

Se precisar sobrescrever host, porta ou origens permitidas:

```bash
cp .env.example .env
```

Variáveis relevantes de autenticação e segurança:

- `TRUST_PROXY=true` para respeitar `x-forwarded-proto` atrás de proxy/reverse proxy.
- `SECURITY_METRICS_TOKEN` para proteger `GET /security/metrics`.
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` para habilitar SSO Google.
- `AUTH_POST_LOGIN_REDIRECT` para definir rota padrão após login.

Quando as três variáveis `GOOGLE_OAUTH_*` estiverem definidas, a API passa a exigir autenticação para rotas de arquitetura (`/architectures...`) e o frontend exibe a tela de login.

## Licença

Este projeto está licenciado sob a MIT License. Consulte [LICENSE](./LICENSE).

## Copyright

Copyright (c) 2026 Anderson Espindola. Consulte [COPYRIGHT](./COPYRIGHT).
