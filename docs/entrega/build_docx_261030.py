#!/usr/bin/env python3
"""Gera docs/entrega/ProjetoG2_261030.docx (entrega da aula de 30/10/2026: model / persistência).

Entradas: capturas em docs/entrega/telas/*.png (`npm run e2e:shots`), diagramas em diagramas/*.png (mermaid)
e trechos de código lidos direto de apps/api/src (marcadores de início/fim). Uso: python3 docs/entrega/build_docx.py
"""
from pathlib import Path

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

BASE = Path(__file__).parent
TELAS = BASE / "telas"
DIAG = BASE / "diagramas"
OUT = BASE / "ProjetoG2_261030.docx"
API = BASE.parent.parent / "apps" / "api" / "src"

NAVY = RGBColor(0x1B, 0x3A, 0x5F)
MUTED = RGBColor(0x5B, 0x6B, 0x82)

TEAM = [
    ("Gustavo Peixoto Siriacov", "202411977", "responsável pelo envio no LEX"),
    ("Tales Ivaniski Galina", "202510926", ""),
    ("Lorenzo Ruggini Lindemann", "202511046", ""),
    ("Eduardo Cassel da Costa", "202513138", ""),
]


def img(path: Path) -> Path:
    if not path.exists():
        raise SystemExit(f"Imagem ausente: {path} (rode `npm run e2e:shots` e o mermaid antes)")
    return path


def shade(cell, hex_fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_fill)
    tc_pr.append(shd)


def para(doc, text="", bold=False, size=None, color=None, align=None, space_after=6, italic=False):
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.bold = bold
    run.italic = italic
    if size:
        run.font.size = Pt(size)
    if color:
        run.font.color.rgb = color
    if align:
        p.alignment = align
    p.paragraph_format.space_after = Pt(space_after)
    return p


def bullet(doc, label, text=""):
    p = doc.add_paragraph(style="List Bullet")
    if text:
        r = p.add_run(label)
        r.bold = True
        p.add_run(text)
    else:
        p.add_run(label)
    p.paragraph_format.space_after = Pt(2)
    return p


def caption(doc, text):
    p = para(doc, text, size=9, color=MUTED, align=WD_ALIGN_PARAGRAPH.CENTER, italic=True, space_after=10)
    return p


def shots_row(doc, items, width_cm):
    """Linha de capturas lado a lado: items = [(arquivo, legenda), ...]."""
    table = doc.add_table(rows=2, cols=len(items))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, (name, cap) in enumerate(items):
        cell = table.cell(0, i)
        cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        cell.paragraphs[0].add_run().add_picture(str(img(TELAS / name)), width=Cm(width_cm))
        c = table.cell(1, i).paragraphs[0]
        c.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = c.add_run(cap)
        r.font.size = Pt(9)
        r.italic = True
        r.font.color.rgb = MUTED
    doc.add_paragraph().paragraph_format.space_after = Pt(4)


def table(doc, header, rows, widths=None):
    t = doc.add_table(rows=1, cols=len(header))
    t.style = "Table Grid"
    for i, h in enumerate(header):
        c = t.rows[0].cells[i]
        shade(c, "1B3A5F")
        run = c.paragraphs[0].add_run(h)
        run.bold = True
        run.font.size = Pt(9.5)
        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
    for row in rows:
        cells = t.add_row().cells
        for i, v in enumerate(row):
            run = cells[i].paragraphs[0].add_run(v)
            run.font.size = Pt(9.5)
    if widths:
        for row in t.rows:
            for i, w in enumerate(widths):
                row.cells[i].width = Cm(w)
    doc.add_paragraph().paragraph_format.space_after = Pt(4)
    return t




def snip(rel: str, start: str, end: str | None = None, extra: int = 0) -> str:
    """Trecho de apps/api/src/<rel>: da 1ª linha com `start` até a 1ª linha seguinte com `end` (inclusive)."""
    lines = (API / rel).read_text(encoding="utf-8").splitlines()
    i = next((k for k, l in enumerate(lines) if start in l), None)
    if i is None:
        raise SystemExit(f"Marcador não encontrado em {rel}: {start!r}")
    j = i
    if end:
        j = next((k for k in range(i, len(lines)) if end in lines[k]), None)
        if j is None:
            raise SystemExit(f"Fim não encontrado em {rel}: {end!r}")
    block = lines[i : j + 1 + extra]
    cut = min((len(l) - len(l.lstrip()) for l in block if l.strip()), default=0)
    return "\n".join(l[cut:] for l in block)


def code(doc, label: str, text: str, size=8):
    """Bloco de código: título com o arquivo de origem e texto monoespaçado sobre fundo cinza."""
    para(doc, label, bold=True, size=9, color=MUTED, space_after=1)
    t = doc.add_table(rows=1, cols=1)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    c = t.rows[0].cells[0]
    shade(c, "F3F5F8")
    p = c.paragraphs[0]
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.line_spacing = 1.0
    for n, line in enumerate(text.split("\n")):
        r = p.add_run(line)
        r.font.name = "Consolas"
        r._element.rPr.rFonts.set(qn("w:eastAsia"), "Consolas")
        r.font.size = Pt(size)
        if n < text.count("\n"):
            r.add_break()
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def pending(doc, text):
    """Campo a ser preenchido pelo usuário, destacado em amarelo."""
    p = doc.add_paragraph()
    r = p.add_run(text)
    r.bold = True
    r.font.highlight_color = 7  # WD_COLOR_INDEX.YELLOW
    return p


def fig(doc, name, cap, width_cm=None, height_cm=None, folder=TELAS):
    kw = {"width": Cm(width_cm)} if width_cm else {"height": Cm(height_cm)}
    doc.add_picture(str(img(folder / name)), **kw)
    doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
    caption(doc, cap)


doc = Document()
sec = doc.sections[0]
sec.page_width, sec.page_height = Cm(21), Cm(29.7)
sec.left_margin = sec.right_margin = Cm(2.2)
sec.top_margin = sec.bottom_margin = Cm(2)

normal = doc.styles["Normal"]
normal.font.name = "Calibri"
normal.font.size = Pt(11)
for name, size in (("Heading 1", 16), ("Heading 2", 13)):
    st = doc.styles[name]
    st.font.name = "Calibri"
    st.font.size = Pt(size)
    st.font.bold = True
    st.font.color.rgb = NAVY

# ------------------------------------------------------------------ identificação
para(doc, "Projeto G2: Organizador de Estudos com IA Integrada", bold=True, size=22, color=NAVY, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
para(doc, "ProjetoG2_261030 · Entrega da aula de 30/10/2026", size=12, color=MUTED, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
para(doc, "Desenvolvimento de Dispositivos Móveis · Universidade La Salle", size=11, color=MUTED, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=14)

# ------------------------------------------------------------------ 1. integrantes
doc.add_heading("1. Integrantes que colaboraram na aula de hoje (30/10)", level=1)
para(doc, "Aplicativo: EduMind. Integrantes da equipe (conforme a entrega de 23/10):", space_after=4)
table(
    doc,
    ["Integrante", "Matrícula", "Colaborou hoje?"],
    [[n, m, "Sim"] for n, m, _ in TEAM],
    widths=[7.5, 3, 6],
)
para(doc, "Todos os integrantes colaboraram na aula de 30/10.", space_after=6)

# ------------------------------------------------------------------ 2. model
doc.add_heading("2. O que é o model do EduMind", level=1)
para(
    doc,
    "O model é a camada que guarda e lê os dados. No EduMind ele fica na API (apps/api/src), em SQLite, e o app web "
    "só conversa com ela por HTTP: nenhuma tela acessa o banco diretamente. Os dados ficam no servidor, ligados à conta "
    "do usuário, e por isso aparecem em qualquer dispositivo com o mesmo login.",
)
bullet(doc, "Estrutura (db/schema.sql): ", "12 tabelas com chaves estrangeiras, restrições (unique, check) e índices. É aplicada pelo migrador no primeiro uso do banco (pragma user_version).")
bullet(doc, "Acesso (db/db.ts): ", "quatro atalhos de consulta com parâmetros (one, all, run, insert). Nenhum valor é concatenado no SQL, o que evita injeção de SQL.")
bullet(doc, "Repositórios e rotas (modules/*): ", "cada módulo tem as operações da sua tabela. Antes de ler ou alterar, a API confirma que o registro pertence ao usuário logado.")
bullet(doc, "Integridade: ", "apagar uma disciplina apaga em cascata seus tópicos, metas, aulas, trabalhos e sessões de estudo; o log de acessos sobrevive à exclusão da conta (guarda cópia do nome e do e-mail).")

# DER em página paisagem
new = doc.add_section()
new.orientation = WD_ORIENT.LANDSCAPE
new.page_width, new.page_height = Cm(29.7), Cm(21)
new.left_margin = new.right_margin = Cm(1.5)
new.top_margin = new.bottom_margin = Cm(1.5)
doc.add_heading("3. Diagrama do modelo de dados (DER)", level=1)
fig(doc, "der-modelo.png", "Figura 1 — Tabelas persistidas e seus relacionamentos (cada usuário só enxerga os próprios dados).", width_cm=26.5, folder=DIAG)
back = doc.add_section()
back.orientation = WD_ORIENT.PORTRAIT
back.page_width, back.page_height = Cm(21), Cm(29.7)
back.left_margin = back.right_margin = Cm(2.2)
back.top_margin = back.bottom_margin = Cm(2)

para(doc, "Resumo das tabelas:", bold=True, space_after=4)
table(
    doc,
    ["Tabela", "O que guarda"],
    [
        ["users", "conta: e-mail, nome, hash da senha (scrypt), papel, ativo/bloqueado, meta semanal"],
        ["sessions", "uma sessão por dispositivo (hash do token, validade, encerramento)"],
        ["access_logs", "log de acesso: nome, data, hora de login e de logout"],
        ["subjects", "disciplinas do usuário (nome único por usuário, professor, sala, cor)"],
        ["topics", "tópicos de cada disciplina com status (pendente, estudando, concluído) e prazo"],
        ["daily_goals", "metas do dia por disciplina, com marcação de concluída"],
        ["study_sessions", "minutos estudados por dia e disciplina (base da tela Progresso)"],
        ["chat_threads / chat_messages", "conversas com o Professor Tutor IA e suas mensagens"],
        ["lessons / assignments", "aulas e trabalhos lidos da faculdade pelo scraper"],
        ["sync_runs", "histórico das sincronizações (status, início, fim, estatísticas)"],
    ],
    widths=[4.5, 12.5],
)

# ------------------------------------------------------------------ 4. telas
doc.add_page_break()
doc.add_heading("4. Telas envolvidas na persistência", level=1)
para(doc, "Cada tela abaixo grava ou lê dados no banco. A tabela relaciona a ação do usuário com a operação feita no model.", color=MUTED)
table(
    doc,
    ["Tela", "Ação do usuário", "Operação no banco"],
    [
        ["Cadastro", "cria a conta", "INSERT em users; abre sessão e log (INSERT em sessions e access_logs)"],
        ["Login", "entra no app", "SELECT em users; INSERT em sessions e access_logs; UPDATE de users.last_login_at"],
        ["Disciplinas", "cria, edita e exclui disciplina", "INSERT / SELECT / UPDATE / DELETE em subjects"],
        ["Detalhe da disciplina", "adiciona tópico e muda o status", "INSERT / SELECT / UPDATE / DELETE em topics"],
        ["Início (metas do dia)", "cria e conclui metas", "INSERT / SELECT / UPDATE / DELETE em daily_goals"],
        ["Progresso", "registra tempo e vê a semana", "INSERT em study_sessions; SELECT com soma por dia e disciplina"],
        ["Perfil e acessos", "edita o perfil e vê os dispositivos", "UPDATE em users; SELECT em sessions e access_logs; encerra sessão (UPDATE)"],
        ["Tutor IA", "conversa com o tutor", "INSERT em chat_threads e chat_messages; DELETE da conversa"],
        ["Aulas", "sincroniza aulas e trabalhos", "INSERT ou UPDATE em lessons, assignments e subjects; registro em sync_runs"],
        ["Admin", "gerencia usuários e vê o log", "SELECT em access_logs e sessions; UPDATE e DELETE em users"],
    ],
    widths=[3.6, 5.0, 8.4],
)

doc.add_heading("Cadastro e login (users, sessions, access_logs)", level=2)
shots_row(doc, [("03-cadastro.png", "Cadastro"), ("01-login.png", "Login"), ("10-perfil-acessos.png", "Perfil e acessos")], width_cm=5.0)
doc.add_heading("Disciplinas, detalhe e metas (subjects, topics, daily_goals)", level=2)
shots_row(doc, [("06-disciplina-form.png", "Nova disciplina"), ("07-disciplinas.png", "Disciplinas"), ("08-disciplina-detalhe.png", "Detalhe (tópicos)")], width_cm=5.0)
shots_row(doc, [("05-dashboard-vazio.png", "Início vazio"), ("11-dashboard.png", "Início com dados (desktop)")], width_cm=7.0)
doc.add_heading("Progresso e tutor (study_sessions, chat_*)", level=2)
shots_row(doc, [("09-progresso.png", "Progresso"), ("14-tutor.png", "Tutor IA (desktop)")], width_cm=6.5)
doc.add_heading("Aulas sincronizadas (lessons, assignments)", level=2)
fig(doc, "13-aulas.png", "Figura 2 — Aulas e trabalhos importados pelo scraper (desktop).", width_cm=12.5)
doc.add_heading("Administração (users, sessions, access_logs)", level=2)
shots_row(doc, [("16-admin-log-acessos.png", "Log de acessos"), ("17-admin-usuarios.png", "Usuários")], width_cm=7.8)
shots_row(doc, [("15-admin-visao-geral.png", "Visão geral"), ("18-admin-sessoes.png", "Sessões ativas")], width_cm=7.8)

# ------------------------------------------------------------------ 5. código
doc.add_page_break()
doc.add_heading("5. Código do model: operações com os dados", level=1)
para(doc, "Trechos reais da API (apps/api/src), reduzidos ao essencial. Todas as consultas usam parâmetros (?).", color=MUTED)

doc.add_heading("5.1 Conexão, migração e atalhos de consulta", level=2)
code(doc, "db/db.ts — migração do esquema", snip("db/db.ts", "export function migrate", "    })();", 2))
code(doc, "db/db.ts — atalhos usados por todos os módulos", snip("db/db.ts", "export const one", "Number(run(db, sql"))
code(doc, "db/schema.sql — exemplo de tabela (restrições e chave estrangeira)", snip("db/schema.sql", "create table subjects", ");", 1))

doc.add_heading("5.2 INSERT (create)", level=2)
code(doc, "modules/auth/users.ts — cria o usuário (tela Cadastro)", snip("modules/auth/users.ts", "export function insertUser", "return findUserById", 1))
code(doc, "modules/subjects/routes.ts — cria a disciplina (tela Disciplinas)", snip("modules/subjects/routes.ts", "const id = insert(", "ctx.now(),", 1))
code(doc, "modules/topics/routes.ts — cria o tópico na próxima posição", snip("modules/topics/routes.ts", "const next = one", "subject.id, input.title", 1))
code(doc, "modules/study/routes.ts — registra uma sessão de estudo (tela Progresso)", snip("modules/study/routes.ts", "const id = insert(", "input.minutes,", 1))

doc.add_heading("5.3 SELECT (read)", level=2)
code(doc, "modules/subjects/repo.ts — disciplina com contagem de tópicos, só do dono", snip("modules/subjects/repo.ts", "export const SUBJECT_SQL", "getSubject = (db", 1))
code(doc, "modules/goals/routes.ts — metas de um dia", snip("modules/goals/routes.ts", "const rows = all<GoalRow>(", "req.auth!.user.id, date,", 1))
code(doc, "modules/access/repo.ts — log de acessos com filtros e paginação", snip("modules/access/repo.ts", "export function listAccessLogs", "return { items: rows.map(toAccessLog), total };", 1))

doc.add_heading("5.4 UPDATE", level=2)
code(doc, "modules/topics/routes.ts — muda o status e mantém done_at coerente", snip("modules/topics/routes.ts", "const status = patch.status", "current.id,", 1))
code(doc, "modules/auth/routes.ts — atualiza o perfil (tela Perfil)", snip("modules/auth/routes.ts", "run(", "patch.name ?? null", 1))

doc.add_heading("5.5 DELETE", level=2)
code(doc, "modules/subjects/routes.ts — exclui a disciplina (apaga em cascata)", snip("modules/subjects/routes.ts", "// Tópicos, metas", "res.status(204)", 1))
code(doc, "modules/admin/routes.ts — exclui usuário (transação)", snip("modules/admin/routes.ts", "access.endAllForUser(target.id, 'admin'); // fecha", "run(db, 'delete from users"))

doc.add_heading("5.6 Transações e importação", level=2)
code(doc, "modules/access/service.ts — login: sessão + log + último acesso, tudo ou nada", snip("modules/access/service.ts", "const sessionId = db.transaction", "return id;", 1))
code(doc, "modules/access/service.ts — logout: encerra a sessão e fecha o log", snip("modules/access/service.ts", "function endSession", "})();", 1))
code(doc, "modules/sync/import.ts — importação idempotente de aulas (insere ou atualiza)", snip("modules/sync/import.ts", "for (const l of course.lessons)", "stats.updated++;", 2))

# ------------------------------------------------------------------ 6. pendências
doc.add_heading("6. Observação", level=1)
para(
    doc,
    "As telas e os trechos refletem o estado do projeto em 30/10/2026. O model continua sendo desenvolvido; "
    "os trechos de código deste documento são gerados a partir dos arquivos da API a cada execução do script de build.",
)

doc.save(OUT)
print(f"Gerado: {OUT}")
