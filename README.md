# Arch Draw

Arch Draw é um editor visual de diagramas de arquitetura e fluxo de software.

Ele combina modelagem visual por drag and drop com importação/exportação Mermaid, permitindo sair de uma visão macro (cloud, rede, domínio) para uma visão micro (serviços, código, dados e relações) no mesmo board.

## O que o projeto entrega

- Canvas interativo para desenhar arquiteturas completas.
- Login opcional com Google SSO para proteger o workspace e isolar acesso.
- Biblioteca de blocos para cloud, software, Kubernetes, algoritmos, bancos e integrações.
- Conexões avançadas entre elementos com estilos, direções e roteamento com desvio de obstáculos.
- Setas de conexão ancoradas pela borda externa da bolinha de contato (apenas lados esquerdo/direito), com ponta da seta na bolinha e linha terminando no centro traseiro da seta.
- Camadas visuais por hierarquia de container (filhos sempre acima do container pai), sem elevar z-index apenas por foco de clique.
- Supressão automática de linhas de conexão que encostam na área de contato do elemento ativo, para reduzir interferência visual durante edição.
- Estilo de conexão `smoothstep` com curvas suaves contínuas para leitura de fluxo.
- Elementos expansíveis/minimizáveis para navegar entre níveis de detalhe.
- Containers não expandem automaticamente durante drag and drop; ajuste dinâmico ocorre apenas em fluxos de expansão/maximização.
- Colapso de elementos aninhados com manutenção do foco visual no canvas e redução de ruído em labels agregadas.
- Normalização automática de vínculo em containers ao carregar/importar templates (nós internos sem `parentId` válido são reanexados ao container correto pelo contexto visual).
- Blocos que suportam conteúdo técnico (código, YAML, SQL, Mermaid e configurações).
- Exportação de diagramas em múltiplos formatos (`.archdraw.json`, `.drawio`, `.excalidraw`, `.mmd`, SVG e PNG).
- Importação de diagramas em múltiplos formatos (`.archdraw`, JSON, `.drawio`/XML, `.excalidraw`, `.mmd`/`.mermaid`).
- Painel de propriedades contextual no ponto do clique, com ajustes globais de fonte de labels, fonte de âncoras e tamanho de ícones.
- Isolamento por sessão para cada usuário ver apenas seus próprios arquivos e template.
- Criação rápida de “Exemplo completo” para acelerar demonstrações e validações.

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

Atalhos de edição:

- `Ctrl/Cmd + Z`: desfaz alterações recentes.
- `Ctrl/Cmd + A`: seleciona todos os nós visíveis no board.
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

URLs padrão:

- Web: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:3333`

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
- `FORCE_SECURE_COOKIES=true` em produção para forçar cookies `Secure` independentemente do protocolo percebido.
- `SECURITY_METRICS_TOKEN` para proteger `GET /security/metrics`.
- `CSRF_COOKIE_NAME` e `CSRF_HEADER_NAME` para política de CSRF (default: `archdraw_csrf` + `x-csrf-token`).
- `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS` e `RATE_LIMIT_MAX_ENTRIES` para hardening de rate-limit.
- `REDIS_URL` para sessão OAuth e rate-limit distribuído com expiração.
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` para habilitar SSO Google.
- `AUTH_POST_LOGIN_REDIRECT` para definir rota padrão após login.
- `REDIS_PASSWORD` para proteger o Redis interno no ambiente Docker (quando `REDIS_URL` usa senha).

Quando as três variáveis `GOOGLE_OAUTH_*` estiverem definidas, a API passa a exigir autenticação para rotas de arquitetura (`/architectures...`) e o frontend exibe a tela de login.

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
