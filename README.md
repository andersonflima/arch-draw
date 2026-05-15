# Arch Draw

Ferramenta local para desenho de arquitetura com canvas drag and drop, entrada Mermaid, aparência inspirada no Excalidraw e persistência em SQLite dentro do projeto.

## Stack

- Monorepo com npm workspaces
- Frontend: React, TypeScript, Vite, React Flow, Mermaid
- Backend: Node.js, Fastify, TypeScript
- Banco local: SQLite via `sql.js`, persistido em `apps/api/data/arch-draw.sqlite`
- Domínio compartilhado em `packages/domain`, sem dependência de HTTP, framework ou banco

## Rodando local

```bash
npm install
npm run dev
```

URLs padrão:

- Web: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:3333`

## Scripts

```bash
npm run typecheck
npm test
npm run build
npm run lint
```

## Funcionalidades

- Criar e listar arquiteturas salvas localmente
- Arrastar blocos para o canvas
- Usar blocos comuns de cloud: VPC, subnet, compute, containers, Kubernetes, serverless, API Gateway, load balancer, CDN, storage, cache, identity, secrets, observability e firewall
- Usar blocos AWS inspirados na biblioteca cloud do draw.io: Account, Region, AZ, VPC, Subnet, Route 53, CloudFront, API Gateway, ALB/NLB, EC2, Auto Scaling, Lambda, ECS, EKS, Fargate, ECR, S3, EBS, EFS, RDS, Aurora, DynamoDB, ElastiCache, Redshift, OpenSearch, SQS, SNS, EventBridge, Kinesis, Step Functions, IAM, Cognito, Secrets Manager, KMS, CloudWatch, CloudTrail, WAF, Shield e Security Group
- Usar blocos de estrutura de código e algoritmos: repository, workspace, package, module, folder, file, class, interface, function, method, type, component, controller, use case, entity, port, adapter, schema, pipeline, condition, loop, recursion, sort, search, graph, tree, hash table, stack, queue e linked list
- Usar containers/boundaries para agrupar blocos. Ao soltar um bloco dentro de um container, ele passa a mover junto; ao arrastar para fora, ele volta para o canvas principal
- Conectar blocos no estilo draw.io
- Editar rótulo, caminho, traço, cor e animação das linhas de conexão
- Editar nome, tipo e cor dos nós
- Escrever Mermaid com validação de sintaxe, ver preview e aplicar como grafo editável apenas quando o lint estiver válido
- Salvar no SQLite local
- Exportar um pacote `.archdraw.json`
- Importar pacote compartilhado por outro usuário

## Arquitetura

```text
packages/domain
  Regras e tipos centrais de arquitetura, validação, Mermaid e pacote de compartilhamento.

apps/api
  Casos de uso, contratos, rotas HTTP e adaptador SQLite.

apps/web
  Interface, canvas, Mermaid editor, integração com API e import/export.
```

O domínio não depende de Fastify, React, SQLite ou bibliotecas de infraestrutura. As dependências apontam para dentro: API e frontend adaptam entrada/saída para os tipos do domínio.

## Variáveis

Copie `.env.example` quando quiser sobrescrever portas ou origem permitida:

```bash
cp .env.example .env
```

## Pontos de atenção

- O build do frontend emite aviso de chunk grande porque Mermaid traz muitos renderizadores. O próximo passo técnico natural é carregar Mermaid por `dynamic import`.
- O parser Mermaid inicial cobre fluxos comuns com conexões `A --> B`; sintaxes Mermaid avançadas renderizam no preview, mas podem precisar de evolução no conversor para virarem nós editáveis.
