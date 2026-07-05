# Engine roadmap

Este documento registra a migração incremental da engine do editor visual.

## Estado atual

O editor preserva a camada visual Angular/DOM/SVG existente para manter compatibilidade funcional, atalhos, exportação, edição inline, colaboração e UX atual.

Já foram isolados os seguintes boundaries:

- `camera`: conversão tela-mundo, retângulo visível e zoom ancorado no cursor.
- `spatial`: geometria e índice espacial por grade uniforme.
- `selection`: seleção por retângulo baseada no índice espacial.
- `interaction`: cálculo de pan, threshold de drag e posições alvo de movimentação.
- `connector`: resolução de lados/portas, alvo de conexão, hit radius e lane offset.
- `render model`: separação de nós renderizáveis em camadas de containers, folhas e arestas.
- `scene`: hierarquia de nós, filhos, descendentes, posição absoluta, profundidade e ancestrais colapsados/abertos.
- `edge graph`: lookup de arestas por id e par de nós.
- `history`: undo baseado em patches forward/backward.
- `render`: agendamento de render por `requestAnimationFrame` com coalescing.

## Gargalos tratados

- Culling de nós deixou de depender de varredura completa do board para a viewport.
- Marquee selection passou a consultar índice espacial.
- Detecção de container por ponto/drop passou a consultar índice espacial.
- Target de conexão passou a consultar candidatos locais.
- Lookup de aresta selecionada e par bidirecional passou a usar índice de arestas.
- Histórico deixou de reter snapshots completos a cada entrada.
- O loop de render saiu do componente e passou para um scheduler dedicado.
- Pan, drag threshold, alvo de drag, portas de conexão e lane offset saíram do componente para engines puras.
- O componente passou a consumir um `RenderModel`, mantendo DOM/SVG atual como backend visual compatível.

## Motor canvas v2 (arestas) — entregue

O módulo isolado `apps/web/src/canvas-engine/` implementa a camada de renderização
nova das arestas, ativada por `engine=v2` e **agora o padrão**:

- `SceneModel`/`scene-builder`: cena ordenada por `zOrder` (persistido no domínio
  desde a versão 2 do documento), com posição absoluta e partição container/folha.
- `EdgeCanvasRenderer`: arestas desenhadas num `<canvas>` em espaço de tela abaixo
  dos nós (polylines arredondadas, dash, cor, arrowheads, labels e preview de
  conexão). z-order correto por construção (nó sempre acima do fio).
- Interação por hit-testing (hover, seleção, menu de contexto, duplo-clique para
  editar label) integrada aos handlers de ponteiro existentes.
- **Cutover**: `resolveEngineVersion` usa `v2` por padrão; `?engine=v1` mantém o
  renderer DOM/SVG legado como escape hatch enquanto o caminho antigo é aposentado.

Pendências conhecidas: overlays cosméticos de transição de container no dark-mode
não foram portados para o canvas; remoção total do caminho SVG legado é limpeza
futura.

## Próximas etapas

1. Expandir `InteractionEngine` para concentrar resize, marquee state, pending port gesture e connection drag state fora do componente Angular.
2. Expandir `ConnectorEngine` com dependências por nó, cache de path por assinatura e recálculo lazy apenas para arestas afetadas.
3. Introduzir atualização incremental do `SceneGraph` e do índice espacial durante drag, evitando rebuild completo quando só posições mudam.
4. Evoluir o `RenderModel` para representar comandos de desenho independentes de DOM/SVG.
5. Implementar camada Canvas 2D para modo denso, mantendo DOM apenas para overlays, inputs e edição inline.
6. Adicionar cache de texto e shapes por assinatura visual.
7. Introduzir dirty rectangles para redraw parcial em Canvas 2D.
8. Mover roteamento pesado e preparação de render para Worker com protocolo incremental.
9. Avaliar OffscreenCanvas para browsers compatíveis, com fallback para Canvas 2D no main thread.
10. Preparar backend WebGL para shapes massivos, mantendo Canvas 2D como fallback.

## Restrições permanentes

- Não alterar schemas de arquivos existentes sem migração explícita.
- Não remover suporte a DOM/SVG enquanto exportação, edição inline e acessibilidade dependerem disso.
- Não trocar UX de seleção, conexão, pan, zoom, minimap ou atalhos durante a migração de engine.
- Cada etapa deve permanecer validada por testes e build.
