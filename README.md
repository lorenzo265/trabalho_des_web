# EduMind — Organizador de Estudos com IA (Projeto G2)

PoC **local** (só `localhost`) em TypeScript, com foco no frontend. O projeto está dividido em três frentes:

| Frente | Pasta | O que faz |
|---|---|---|
| **1. Telas** | `apps/web` | Interface React (mobile-first): Login, Dashboard, Disciplinas, Tutor IA, Progresso, Aulas, Perfil, Admin |
| **2. Acessos** | `apps/api` (módulos `auth`, `access`, `admin`) | Cadastro/login, sessão por dispositivo, **log de acesso**, área do administrador |
| **3. Aulas** | `apps/scraper` (+ `sync`/`lessons` na API) | Scraper Playwright que lê disciplinas, aulas e trabalhos (com um portal mock para desenvolver) |

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

Outros comandos: `npm test`, `npm run typecheck`, `npm run scrape` (roda o scraper pela linha de comando),
`npm run e2e` (teste de ponta a ponta no navegador, com a pilha no ar) e `npm run e2e:shots` (também grava as capturas de tela em `docs/entrega/telas/`).

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
- [Briefing](docs/superpowers/specs/2026-10-09-studypilot-briefing-design.md) e [SDD](docs/superpowers/specs/2026-10-09-studypilot-sdd-design.md) — visão de longo prazo (escala)

## Segredos

Nunca commite credenciais, `.env`, HAR, traces ou o banco `data/`.
