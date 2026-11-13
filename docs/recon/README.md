# Reconhecimento do portal da faculdade (`npm run recon`)

Para escrever o adaptador do portal real (`apps/scraper/src/adapters/portal.ts`) é preciso **ver** o portal: como é o
login, onde ficam as disciplinas, as aulas e os trabalhos, e se existe JSON interno que dispense ler o HTML. Este comando
faz esse reconhecimento **com você no comando**: você loga e navega num navegador visível, e ele salva cada página que
você mandar, **sem scripts e com dados pessoais mascarados**, mais um relatório do que encontrou.

> Corresponde ao protocolo de reconhecimento do [SDD](../superpowers/specs/2026-10-09-studypilot-sdd-design.md) (§5.1)
> e às decisões D1 (qual plataforma) e D2 (como é o login) do [documento de estrutura](../superpowers/specs/2026-10-23-poc-estrutura-stack.md) (§9).

## Como rodar (no seu computador, que tem tela)

Requisitos: Node 22+, `npm install` feito e um navegador. Use o Chromium do Playwright (`npx playwright-core install chromium`)
**ou** o Chrome/Edge que você já tem (`--channel chrome` / `--channel msedge`).

```bash
npm run recon -- https://portal.suafaculdade.edu.br --mask "Seu Nome Completo" --mask 20231234
```

- `--mask` esconde esse texto nos arquivos (ignora acento e maiúsculas). Repita para cada dado: nome, matrícula/RA, e-mail
  pessoal… Quem tem nome composto: o nome inteiro **e** cada parte com 4+ letras são escondidos.
- O endereço também pode vir de `PORTAL_URL`. **Não** coloque usuário e senha no endereço.

Um navegador abre no endereço. **Faça o login você mesmo(a)** e use o terminal para capturar:

| Digite | O que faz |
|---|---|
| `c login` | captura a página aberta agora, com o rótulo "login" |
| `Enter` (vazio) | o mesmo, com o rótulo tirado do endereço |
| `q` | termina e gera o relatório (fechar o navegador também termina) |
| `h` | mostra os comandos |

### Quais páginas capturar

Capture nesta ordem. Cada uma responde a uma pergunta do adaptador:

1. **A tela de login, antes de entrar** (`c login`): campos, SSO, captcha, pedido de código.
2. **A lista de disciplinas** logo depois do login (`c disciplinas`).
3. **Uma disciplina** com aulas e trabalhos (`c disciplina`). Se ela tem abas (Aulas, Atividades, Notas, Materiais…), abra
   **cada aba** e capture uma a uma.
4. **Uma disciplina "difícil"**: sem aula marcada, com trabalho já corrigido (com nota), com sala em branco. Os casos de
   borda são o que mais quebra o adaptador.
5. Se existir, a página de **calendário/agenda** e a de **notas**.

Se a página só carrega os dados depois de um tempo, espere aparecer na tela e então capture.

## O que sai (pasta `data/recon/<data-hora>/`, ignorada pelo Git)

| Arquivo | Conteúdo |
|---|---|
| `NN-rotulo.html` | A página limpa: sem `<script>`, `<style>`, comentários, `on*=`; valores de campos e senhas trocados por `[valor]`; tokens e parâmetros sensíveis da URL escondidos. Iframes viram `NN-rotulo.frameN.html`. |
| `relatorio.md` | **Leia primeiro.** Plataforma provável, tipo de login (formulário, SSO, captcha, 2 fatores), formulários e campos, tabelas e cabeçalhos, rotas de rede, e o que foi mascarado. |
| `rede.json` | Rotas chamadas (método, status, caminho com ids trocados por `:id`, **só os nomes** dos parâmetros) e, para respostas JSON, **o formato** (chaves e tipos), nunca os valores. |
| `recon.json` | O mesmo em formato de máquina. |

### O que o comando NUNCA grava

Senha ou qualquer coisa digitada nos campos, cookies, `localStorage`, cabeçalhos (`Authorization`…), corpo de requisições
enviadas, HAR, trace e capturas de tela. Ele também não digita nada nem clica por você: só observa o que você faz.

## Mascaramento: o que é automático e o que não é

Automático: e-mails, CPF (`000.000.000-00`), telefones com DDD (`(11) 91234-5678`, `+55…`), imagens embutidas (`data:`),
JWT, identificadores opacos longos (letras **e** números, 24+ caracteres), valores de parâmetros como `token`, `sesskey`,
`session`, `user`, `email`, `matricula`, `nome` e `jsessionid`.

**Não é automático:** seu nome, sua matrícula/RA, nomes de colegas e professores, notas e faltas. Nome e matrícula você
cobre com `--mask`. O resto, e qualquer dado que o programa não reconheça, **só você vê**. Por isso:

### Antes de compartilhar qualquer arquivo

1. Abra os `.html` num editor e procure (Ctrl+F) por seu **nome**, **matrícula**, **e-mail**, **telefone**, **CPF**, nomes
   de colegas e as **notas** que não queira expor.
2. Troque o que sobrar por algo genérico (`Fulano`, `20230000`, `7,5`). Pode editar à vontade: o que importa é a
   **estrutura** (tags, classes, ids, cabeçalhos de tabela e o formato dos textos, como `23/10/2025` ou `19h às 20h30`).
3. Envie só os arquivos revisados. As credenciais continuam **fora do chat e do repositório**: ficam em variáveis de
   ambiente (`PORTAL_URL`, `PORTAL_USER`, `PORTAL_PASSWORD`).

Se o repositório for **privado** (decisão D11), os arquivos revisados podem ir para `docs/recon/fixtures/<plataforma>/`.
Eles viram as fixtures dos testes do adaptador, como o portal mock já faz hoje.

## Termos de uso (D10)

O reconhecimento é só leitura e usa a **sua** conta, como se você estivesse navegando. Mesmo assim, confira se os termos
de uso da faculdade permitem automatizar a leitura da própria conta antes de ligar o scraper de verdade.

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| "Não consegui abrir o navegador" | `npx playwright-core install chromium`, ou use `--channel chrome`. Precisa de tela: não roda em servidor sem interface gráfica. |
| O HTML salvo vem sem os dados (tabelas vazias) | A página é montada por JavaScript. Espere carregar e capture de novo; veja `rede.json`: se houver JSON, os dados vêm de lá (e o adaptador pode usar esses endpoints). |
| O login abre uma janela nova (SSO) | O comando captura a **última aba aberta**. Capture o que precisar em cada janela. |
| A página tem iframes | O conteúdo deles sai em `NN-rotulo.frameN.html` (até 5 por página). |
| Erro "Termo para mascarar muito curto" | Cada `--mask` precisa de 3+ caracteres. |

## Para quem for mexer no código

`apps/scraper/src/recon/`: `mask.ts` (mascaramento, puro), `shape.ts` (formato do JSON), `platform.ts` (indícios de
plataforma/SSO/captcha), `capture.ts` (sessão de captura e limpeza do DOM no navegador), `report.ts` (relatório) e
`cli.ts` (comando). Testes: `npm test -w @edumind/scraper` (a parte com navegador é pulada se não houver Chromium).
