# Pomodoro Cosmos

Sistema Pomodoro local, em TypeScript, com quatro temas completos — dois cósmicos e dois tech —
cada um com visual, sons, rótulos e sistema de progressão próprios.

## Rodar

```bash
npm install
npm run dev        # abre em http://localhost:5173
```

Para gerar e servir a versão de produção:

```bash
npm run build      # checa tipos + gera dist/
npm run preview    # serve dist/ na MESMA porta 5173
```

> `dev` e `preview` usam a mesma porta de propósito — veja a seção de progresso abaixo.
> A pasta `dist/` precisa ser servida por HTTP (os módulos ES não carregam via `file://`).

## Onde o progresso fica salvo

A fonte da verdade é o arquivo **`data/progress.json`**, na pasta do projeto. Um plugin do Vite
(`server/progress-file.ts`) expõe `GET/POST /__progress` e o app grava lá a cada mudança, com
escrita atômica (arquivo temporário + `rename`, então uma queda no meio não corrompe nada).
O `localStorage` continua existindo como cópia local e cache de partida.

Isso significa que o progresso **sobrevive** a limpar os dados do navegador, trocar de navegador,
usar aba anônima ou reinstalar o Chrome. Para levar para outra máquina, copie `data/progress.json`
— ou versione a pasta `data/` no git, se quiser histórico.

Ao abrir, o app reconcilia disco e navegador: vence o lado com gravação mais recente
(campo `savedAt`). Se o arquivo ainda não existe, o que estava no navegador é migrado para ele.

O indicador **⛁** na barra superior mostra onde a gravação está caindo:

| Indicador | Significado |
|---|---|
| `⛁ disco` | rodando via `npm run dev` / `npm run preview` — gravando em `data/progress.json` |
| `⛁ navegador` | servido por outro servidor estático, sem o plugin — só `localStorage`, e o app avisa na abertura |

**Cuidados que continuam valendo:**

- **A porta faz parte da identidade do `localStorage`.** Por isso `dev` e `preview` foram fixados
  na mesma porta 5173 — em portas diferentes o navegador trata como dois sites distintos.
  Com o arquivo em disco isso deixa de causar perda, mas mantém a cópia local coerente.
- **Duas abas abertas ao mesmo tempo** se sobrescrevem (cada uma tem seu estado em memória).
  Ao voltar para uma aba antiga, o app detecta que o disco ficou mais novo e avisa para recarregar.
- **Backup extra**: **Configurações → Exportar dados** gera um JSON avulso, e **Importar** restaura
  (a importação vence o arquivo em disco). **Apagar tudo** limpa o navegador *e* o arquivo.

## Temas

| Tema | Família | Timer | Progressão |
|---|---|---|---|
| **Órbita Estelar** | cósmico | O planeta percorre uma órbita completa; a estrela pulsa no centro | Cada foco concluído **forma um planeta**. Planetas acumulados desbloqueiam sistemas estelares (Sistema Solar → Núcleo Galáctico) e tipos de mundo (rochoso, oceânico, anelado, exótico…) |
| **Horizonte de Eventos** | cósmico | A matéria espirala para dentro e a atração cresce com o tempo; no fim **tudo colapsa**, clarão, e o disco se refaz | **Massa em M☉** acumulada por minuto focado: Estelar → Intermediário → Supermassivo → Ultramassivo → Quasar. Jatos relativísticos aparecem a partir do nível 3 |
| **TTY / Kernel** | tech | Um processo real rodando: barra ASCII, `[ OK ]` streaming, spinner, cpu/mem, cursor piscando | Cada sessão é um **processo concluído**; você **escala privilégios** (guest → user → sudo → root → kernel → sentient) e instala pacotes (cron, htop, tmux, vim, git, docker, k8s…) |
| **Reator Neon** | tech | O núcleo carrega bobina a bobina, arcos elétricos aumentam e nos 10% finais entra em alerta de **sobrecarga**; ao terminar, descarrega em faíscas e tremor | **MW gerados** constroem o reator: cada módulo desbloqueado (bobina, criogenia, capacitores, injetor, fusão, overdrive, antimatéria, singularidade) **aparece de verdade** como um anel no núcleo |

Trocar de tema muda também botões, campos de texto, tipografia, cantos, maiúsculas,
rótulos das fases ("Órbita/Afélio", "exec/sleep/halt", "Carga/Resfriar"), os sons e o painel de progresso.

## Recursos

- **Timer** com foco, pausa curta e pausa longa, ciclos configuráveis, auto-início opcional.
  O tempo restante vem sempre do relógio do sistema — a aba em segundo plano não atrasa a contagem.
- **Marcas de tempo de foco**: cada sessão vira um registro com horário, duração, tema e tarefa
  (inclusive as interrompidas, marcadas como tal).
- **Anotações** semi-transparentes com salvamento automático, e um **registro/log** com entradas
  do sistema, recompensas e notas rápidas suas.
- **Gamificação**: progressão por tema + 15 conquistas globais (sequência de dias, sessões
  profundas, coruja, madrugador, explorador dos 4 temas…), sequência diária e meta de sessões.
- **Efeitos**: canvas de fundo e de palco por tema, partículas, glow, tremor de tela, clarões,
  toasts de recompensa, com intensidade ajustável e modo "reduzir movimento".
- **Efeitos sonoros** sintetizados na Web Audio API (sem arquivos): timbres senoidais e corais
  no cósmico, ondas quadradas de terminal, serra e ruído no reator.
- **Estatísticas**: últimos 7 dias, tempo por tema, totais e conquistas.
- **Configurações** completas + exportar/importar/apagar dados.

## Atalhos

| Tecla | Ação |
|---|---|
| `Espaço` | iniciar / pausar |
| `R` | reiniciar a fase |
| `S` | pular fase |
| `N` | focar nas anotações |
| `M` | ligar/desligar som |
| `,` | configurações |
| `1`–`4` | trocar de tema |
| `Esc` | fechar modal |

## Estrutura

```
server/
  progress-file.ts   plugin do Vite: grava/lê data/progress.json
src/
  core/       store (persistência + sync), timer, áudio, gamificação, tipos
  themes/     um módulo por tema: cores, cena em canvas, sons, progressão, rótulos
  ui/         renderer de canvas, painéis, configurações, toasts
  styles/     folha única, inteiramente dirigida por CSS custom properties
```

Adicionar um tema novo é implementar a interface `ThemeModule` (`src/themes/types.ts`)
e registrá-lo em `src/themes/index.ts` — o resto da UI se adapta sozinho.
