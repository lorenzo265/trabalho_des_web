# trabalho_des_web

Projeto G2 — **Organizador de Estudos com IA**. Este repositório tem duas trilhas:

| Trilha | Branch | O que é |
|---|---|---|
| **A — StudyPilot** | `main` | Ferramenta real: scraping do app da faculdade + automação de estudo (calendário, lembretes, plano de estudo, notas, assistente de trabalhos, tutor com IA). Stack TypeScript. |
| **B — Entregável G2** | `dart` | Sistema simples, web, **100% Dart** (Flutter Web + servidor Shelf + SQLite), que será entregue na disciplina. **Nunca é mergeada em `main`.** |

## Documentação (specs)

- [Briefing do plano](docs/superpowers/specs/2026-10-09-studypilot-briefing-design.md) — escopo, funcionalidades, fases, dúvidas abertas
- [SDD completo](docs/superpowers/specs/2026-10-09-studypilot-sdd-design.md) — arquitetura, stack, scraper, dados, IA, segurança, testes, deploy, roadmap
- Spec da Trilha B: na branch `dart` (`docs/superpowers/specs/2026-10-09-dart-entregavel-design.md`)

## Status

Fase de **especificação**. Nenhum código de aplicação foi escrito; a implementação começa após a aprovação das specs.

## Segredos

Nunca commite credenciais, HAR, traces ou sessões. Use variáveis/segredos de ambiente (ver Apêndice C do SDD).
