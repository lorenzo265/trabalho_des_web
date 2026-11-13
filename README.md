# EduMind — Organizador de Estudos com IA (Projeto G2)

PoC **local** (só `localhost`) em TypeScript, com foco no frontend. O projeto está dividido em três frentes:

| Frente | Pasta | O que faz |
|---|---|---|
| **1. Telas** | `apps/web` | Interface React (mobile-first): Login, Dashboard, Disciplinas, Tutor IA, Progresso, Aulas, Calendário, Perfil, Admin |
| **2. Acessos** | `apps/api` (módulos `auth`, `access`, `admin`) | Cadastro/login, sessão por dispositivo, **log de acesso**, área do administrador |
| **3. Aulas** | `apps/scraper` (+ `sync`/`lessons`/`changes`/`calendar` na API) | Scraper Playwright que lê disciplinas, aulas e trabalhos (com um portal mock para desenvolver), detecta o que mudou a cada sincronização e exporta a agenda em `.ics` |

Os três conversam só pelos schemas de `packages/contracts`. Detalhes, modelo de dados, API e fluxogramas:
[`docs/superpowers/specs/2026-10-23-poc-estrutura-stack.md`](docs/superpowers/specs/2026-10-23-poc-estrutura-stack.md).

## Como rodar

Requisitos: Node 22+. Na primeira vez: `npm install` e `npx playwright-core install chromium` (só para o scraper).

```bash
cp .env.example .env     # opcional
npm run seed             # dados de demonstração (aluno demo + admin)
npm run dev              # api (3001) + web (5173) + portal mock (4010)
```

Abra <http://localhost:5173>. Logins de demonstração criados pelo `seed`:
`aluno@edumind.local` / `aluno12345` e (admin) `admin@edumind.local` / `admin12345`.

Outros comandos: `npm test`, `npm run typecheck` (o GitHub Actions roda os dois, mais `build` e o `e2e`, em [`.github/workflows/ci.yml`](.github/workflows/ci.yml)), `npm run scrape` (roda o scraper pela linha de comando),
`npm run e2e` (teste de ponta a ponta no navegador, com a pilha no ar) e `npm run e2e:shots` (também grava as capturas de tela em `docs/entrega/telas/`).

`npm run recon -- <endereço-do-portal> --mask "Seu Nome"` abre o portal real num navegador visível e salva as páginas que
você escolher, sem scripts e com dados pessoais mascarados, para escrever o adaptador da faculdade:
[`docs/recon/`](docs/recon/README.md).

## O que o app faz além do básico

- **Novidades da faculdade:** a cada sincronização o app compara com a anterior e mostra trabalho novo, prazo alterado, nota lançada, aula remarcada e sala alterada (cartão em *Aulas*, aviso no *Início* e selo no menu). A primeira sincronização é só a linha de base e não gera novidades. Para ver isso na demonstração: sincronize, rode `npm run portal:mudar` (o portal mock passa a mostrar mudanças) e sincronize de novo; `npm run portal:reset` desfaz.
- **Lembretes de prazo** no *Início*: o que vence hoje, amanhã, em até 3 dias ou venceu há até 7 dias; dá para dispensar, e o lembrete volta se a urgência aumentar. Não há push nem e-mail (fora do PoC).
- **Calendário** (mês e semana) com aulas e prazos nas cores das disciplinas e **exportação `.ics`** para Google Agenda, Outlook ou Calendário da Apple. O arquivo é um download autenticado (não é um feed assinável: o app roda só em `localhost`).
- **Notas e projeção** por disciplina (aba *Trabalhos*): média ponderada, meta de média e *quanto preciso tirar* nos trabalhos que faltam. Meta e pesos são do aluno e o sync não os sobrescreve; a nota, o prazo e a situação vêm da faculdade.
- **Tutor com contexto:** além do nome da disciplina, o Tutor recebe tópicos pendentes, próximas aulas e prazos (limitados, e tratados como dados, nunca como instruções).

## Entrega da aula (23/10)

[`docs/entrega/`](docs/entrega/) reúne o documento **ProjetoG2_261023** (`.docx` e `.pdf`), com a equipe, as telas de acesso,
o modelo de dados do acesso e do log, o fluxograma de acesso e registro do log e a área do administrador. As capturas
(`telas/`) e os diagramas (`diagramas/`) são gerados por `npm run e2e:shots` e pelos arquivos `.mmd`.

## Proposta do trabalho final (26/10)

[`docs/proposta/`](docs/proposta/) tem a proposta em PDF (`PropostaTrabalhoFinal_EduMind.pdf`: grupo, identidade visual, escopo,
responsáveis, cronograma e objetivos), o logo (`logo-edumind.svg`/`.png`) e o texto para o fórum (`post-forum.txt`).
Para regerar o PDF depois de editar `proposta.html`: `node docs/proposta/build_pdf.mjs`.

## Documentação

- [Estrutura e tech stack do PoC](docs/superpowers/specs/2026-10-23-poc-estrutura-stack.md) ← **comece aqui**
- [Reconhecimento do portal da faculdade](docs/recon/README.md) (`npm run recon`)
- [Briefing](docs/superpowers/specs/2026-10-09-studypilot-briefing-design.md) e [SDD](docs/superpowers/specs/2026-10-09-studypilot-sdd-design.md) — visão de longo prazo (escala)

## Segredos

Nunca commite credenciais, `.env`, HAR, traces ou o banco `data/`.
