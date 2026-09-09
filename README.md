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
| **Órbita Estelar** | cósmico | O planeta percorre uma órbita completa, com rastro; a estrela pulsa no centro, com raios rotativos, espigões de difração e faíscas em suspensão. Os planetas coletados têm halo e reflexo especular apontando para a estrela | Cada foco concluído **forma um planeta**. Planetas acumulados desbloqueiam sistemas estelares (Sistema Solar → Núcleo Galáctico) e tipos de mundo (rochoso, oceânico, anelado, exótico…) |
| **Horizonte de Eventos** | cósmico | A matéria espirala para dentro e a atração cresce com o tempo. Asteroides, cometas e estrelas caem no horizonte sendo **esticados pela maré** (espaguetificação) até virarem fios de matéria, com clarão a cada corpo devorado. No fim **tudo colapsa**, clarão, e o disco se refaz | **Massa em M☉** acumulada por minuto focado: Estelar → Intermediário → Supermassivo → Ultramassivo → Quasar. Jatos relativísticos aparecem a partir do nível 3 |
| **TTY / Kernel** | tech | Um processo real rodando: barra ASCII, `[ OK ]` streaming, spinner, cpu/mem, cursor piscando, **osciloscópio de carga**, **dump hexadecimal** rolando na lateral, LEDs de atividade e rasgos de sinal ocasionais | Cada sessão é um **processo concluído**; você **escala privilégios** (guest → user → sudo → root → kernel → sentient) e instala pacotes (cron, htop, tmux, vim, git, docker, k8s…) |
| **Reator Neon** | tech | Um reator **físico**: chassi octogonal de aço, dutos de refrigeração, faixas de perigo e suportes, com uma cápsula de vidro no centro guardando um **núcleo de plasma neon pulsante** (o batimento acelera conforme a carga sobe). Em volta da cápsula, um **anel de contagem neon** com marcações e cabeça luminosa. Nos 10% finais entra em alerta de **sobrecarga**; ao terminar, descarrega em arcos, faíscas, vapor pelas válvulas e tremor | **MW gerados** constroem o reator: cada módulo desbloqueado (bobina, criogenia, capacitores, injetor, fusão, overdrive, antimatéria, singularidade) **aparece de verdade** como um trilho em volta do chassi |

Trocar de tema muda também botões, campos de texto, tipografia, cantos, maiúsculas,
rótulos das fases ("Órbita/Afélio", "exec/sleep/halt", "Carga/Resfriar"), os sons e o painel de progresso.

## Estágios: cada desbloqueio muda o app inteiro

Ao atingir um novo estágio, a interface **inteira** é repintada — acento, brilho, bordas, texto —
e a arte principal ganha ou troca elementos. Não é só um número subindo:

| Tema | O que muda a cada estágio |
|---|---|
| **Órbita** | A estrela troca de tipo e cor a cada sistema: anã amarela → laranja → **anã vermelha** → branca → **azul-branca** → **supergigante vermelha** (que pulsa devagar e expele cascas de gás) → **Núcleo Galáctico**, onde o centro do sistema vira um buraco negro. No caminho aparecem estrela companheira em órbita fechada (2+), cinturão de asteroides (4+) e difração de 6 pontas (5+) |
| **Buraco negro** | Disco de acreção mais largo e quente, horizonte maior, segundo anel de fótons (2+), jatos relativísticos (3+), arcos de lente gravitacional (4+) e, no **Quasar**, jatos cegantes que iluminam a cena toda e a paleta vira ciano-branca |
| **TTY / Kernel** | O fósforo muda de cor a cada privilégio: verde (guest) → verde vivo (user) → **âmbar** (sudo) → **vermelho** (root) → **ciano** (kernel) → **magenta** (sentient). Mapa de memória aparece no sudo, a chuva de glifos fica mais densa a cada nível, e no `sentient` o processo começa a escrever comentários próprios |
| **Reator** | Mk-0 é um protótipo de bancada: chassi aberto, sem placas nem faixas de perigo. As gerações seguintes fecham o chassi, trocam a paleta (magenta → ciano → âmbar → violeta), somam anéis de contagem concêntricos e emissores (6 → 8 → 12), e no **Motor de Singularidade** o plasma dá lugar a uma singularidade contida, com disco de acreção girando dentro da cápsula |

### Escolher o estágio

Um estágio desbloqueado nunca se perde. Na aba **Coleção**, clique em qualquer estágio já
conquistado para usar o visual dele — cores, efeitos e arte mudam na hora. O botão **automático**
volta a seguir sempre o mais recente, e é para ele que o app retorna sozinho quando você
desbloqueia algo novo (para você ver a novidade). Estágios bloqueados ficam apagados e não clicam.

Escolher um estágio antigo é só cosmético: a barra de progresso continua contando a evolução real.

## Avisar o celular

Sim, dá. O app manda um push quando **um foco termina**, através de um serviço de notificação.
Quem faz a chamada é o servidor Vite local, não o navegador — assim não há problema de CORS e o
tópico/token nunca sai numa requisição da página.

Configure em **Configurações → Avisar no celular**:

**Opção 1 — ntfy (recomendada: grátis, sem conta)**

1. Instale o app **ntfy** no celular (Android/iOS) ou abra `ntfy.sh` no navegador dele.
2. Assine um tópico com um nome **longo e difícil de adivinhar**, ex.: `pomodoro-eduardo-x7k2p9`.
3. No app, escolha `ntfy` e cole o mesmo nome no campo **Tópico ou URL**.
4. Clique em **testar** — o aviso deve chegar no celular em segundos.

> No servidor público `ntfy.sh` o nome do tópico é a única credencial: **quem souber o nome lê e
> envia** mensagens nele. Use um nome aleatório, e não coloque nada sensível nas tarefas se isso
> te preocupar. Dá para apontar para um ntfy próprio colando a URL completa do seu servidor.

**Opção 2 — webhook (Discord, Slack, Gotify, o que você já usa)**

Escolha `Webhook` e cole a URL. O corpo enviado traz `title`, `message`, `content` (formato do
Discord) e `text` (formato do Slack) ao mesmo tempo, então funciona nos três sem adaptação.

**Detalhes que valem saber**

- Só funciona com o app aberto e rodando por `npm run dev` / `npm run preview` — é o servidor local
  que faz o envio. Se ele estiver fora do ar, a falha vai para o Registro e nada trava.
- O destino fica salvo em `data/progress.json` em texto puro. Se usar um webhook com token na URL,
  ele está nesse arquivo.
- O aviso dispara só no fim de **sessões de foco**, não nas pausas.

**Alternativa sem serviço externo:** rodar `npm run dev -- --host` e abrir
`http://<ip-do-pc>:5173` pelo celular na mesma Wi-Fi. Funciona para *usar* o app, mas a API de
notificação do navegador exige contexto seguro (HTTPS ou localhost), então em HTTP puro na rede
local o celular não emite notificação do sistema — só o som e o visual da própria página aberta.

## Recursos

- **Timer** com foco, pausa curta e pausa longa, ciclos configuráveis, auto-início opcional.
  O tempo restante vem sempre do relógio do sistema — a aba em segundo plano não atrasa a contagem.
- **Marcas de tempo de foco**: cada sessão vira um registro com horário, duração, tema e tarefa
  (inclusive as interrompidas, marcadas como tal).
- **Anotações** semi-transparentes com salvamento automático, e um **registro/log** com entradas
  do sistema, recompensas e notas rápidas suas.
- **Gamificação**: progressão por tema, com estágios que transformam o visual (acima) + 15 conquistas globais (sequência de dias, sessões
  profundas, coruja, madrugador, explorador dos 4 temas…), sequência diária e meta de sessões.
- **Efeitos**: canvas de fundo e de palco por tema, partículas, glow, tremor de tela, clarões,
  toasts de recompensa, com intensidade ajustável e modo "reduzir movimento".
- **Modo zen** (`H` ou Configurações → Visual): esconde os dígitos e deixa só a arte do tema.
- **Efeitos sonoros** sintetizados na Web Audio API (sem arquivos): timbres senoidais e corais
  no cósmico, ondas quadradas de terminal, serra e ruído no reator.
- **Som ambiente contínuo** por tema, com paisagens distintas para repouso e sessão em andamento,
  que **evoluem conforme o tempo passa**:
  - **Órbita** — pad quente com quinta e brilho que crescem ao longo da órbita, respiração lenta
    e sinos esparsos; na pausa o timbre sobe um tom e fica mais leve.
  - **Buraco negro** — sub grave de 36 Hz com batimento que **acelera** conforme a atração aumenta,
    vento filtrado que abre, dissonância que só entra depois dos 35% e rangidos de matéria esticada.
  - **TTY / Kernel** — ventoinha que acelera com a carga, zumbido de 60 Hz, chiado de monitor,
    o disco procurando setores e rajadas de transferência; em repouso, um relé de vez em quando.
  - **Reator** — zumbido da rede, bobina que **sobe de tom** conforme carrega, plasma chiando,
    pulsação que acelera com a carga, estalos de arco e alarme nos 10% finais; em repouso,
    purgas de pressão espaçadas.

  Ligar/desligar e volume próprio em **Configurações → Áudio**. O ambiente continua tocando com a
  aba em segundo plano — é a intenção, para servir de trilha de foco.
- **Estatísticas**: últimos 7 dias, tempo por tema, totais e conquistas.
- **Configurações** completas + exportar/importar/apagar dados.

## Atalhos

| Tecla | Ação |
|---|---|
| `Espaço` | iniciar / pausar |
| `R` | reiniciar a fase |
| `H` | esconder/mostrar o relógio (modo zen) |
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
