import type { PortalAssignment, PortalCourse, PortalLesson } from './fixtures';
import { weekdayOf } from './fixtures';

/** HTML do portal mock: parece um portal acadêmico comum (tabelas, rótulos em PT-BR, datas dd/mm/aaaa). */

export const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const brDate = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

/** "19:00" → "19h"; "20:30" → "20h30". */
const shortTime = (t: string): string => {
  const [h, m] = t.split(':');
  return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}`;
};

const timeRange = (l: PortalLesson, style: PortalCourse['timeStyle']): string =>
  style === 'colon' ? `${l.start} - ${l.end}` : `${shortTime(l.start)} às ${shortTime(l.end)}`;

const STYLE = `
  *{box-sizing:border-box}
  body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#f1f3f6;color:#222}
  header.topo{background:#1f3a5f;color:#fff;padding:12px 24px;display:flex;justify-content:space-between;align-items:center}
  header.topo a{color:#cfe0f5;text-decoration:none;margin-left:16px}
  main{max-width:960px;margin:24px auto;padding:0 16px}
  .card{background:#fff;border:1px solid #d9dee6;border-radius:6px;padding:20px;margin-bottom:20px}
  h1{font-size:22px;margin:0 0 12px} h2{font-size:17px;margin:0 0 10px;color:#1f3a5f}
  table.tabela{width:100%;border-collapse:collapse;font-size:14px}
  table.tabela th,table.tabela td{border-bottom:1px solid #e5e8ee;padding:8px;text-align:left;vertical-align:top}
  table.tabela th{background:#f6f8fb;color:#445}
  ul.lista-disciplinas{list-style:none;margin:0;padding:0}
  li.disciplina{padding:12px 0;border-bottom:1px solid #e5e8ee;display:flex;justify-content:space-between}
  li.disciplina a{color:#1d4ed8;font-weight:bold;text-decoration:none}
  .professor{color:#667}
  dl.curso-info{display:grid;grid-template-columns:120px 1fr;gap:4px 12px;margin:0}
  dl.curso-info dt{font-weight:bold;color:#445} dl.curso-info dd{margin:0}
  form.login{max-width:360px;margin:60px auto}
  .campo{margin-bottom:14px} .campo label{display:block;font-size:13px;margin-bottom:4px;color:#445}
  .campo input{width:100%;padding:9px;border:1px solid #b9c1ce;border-radius:4px;font-size:15px}
  button.btn{background:#1d4ed8;color:#fff;border:0;border-radius:4px;padding:10px 18px;font-size:15px;cursor:pointer}
  .alert-danger{background:#fdecea;border:1px solid #f5b5ae;color:#a12b1f;padding:10px 12px;border-radius:4px;margin-bottom:14px}
  .situacao{font-weight:bold}
`;

const layout = (title: string, body: string, logged: boolean): string => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — Portal Acadêmico</title><style>${STYLE}</style></head>
<body>
<header class="topo"><strong>Portal Acadêmico · Faculdade Demo</strong>${
  logged ? '<nav><a href="/disciplinas">Minhas disciplinas</a><a href="/sair">Sair</a></nav>' : ''
}</header>
<main>${body}</main></body></html>`;

export function loginPage(error?: string): string {
  return layout(
    'Entrar',
    `<form class="login card" method="post" action="/login">
  <h1>Acesso do aluno</h1>
  ${error ? `<div class="alert alert-danger" role="alert">${esc(error)}</div>` : ''}
  <div class="campo"><label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="username" required></div>
  <div class="campo"><label for="senha">Senha</label><input id="senha" name="senha" type="password" autocomplete="current-password" required></div>
  <button class="btn" type="submit">Entrar</button>
</form>`,
    false,
  );
}

export function coursesPage(courses: PortalCourse[]): string {
  const items = courses
    .map(
      (c) =>
        `<li class="disciplina"><a href="/disciplinas/${esc(c.id)}">${esc(c.name)}</a><span class="professor">${esc(c.professor)}</span></li>`,
    )
    .join('\n');
  return layout(
    'Minhas disciplinas',
    `<section class="card"><h1>Minhas disciplinas</h1><ul class="lista-disciplinas">${items}</ul></section>`,
    true,
  );
}

const lessonRow = (l: PortalLesson, style: PortalCourse['timeStyle']): string =>
  `<tr id="aula-${esc(l.id)}"><td>${brDate(l.date)} (${WEEKDAYS[weekdayOf(l.date)]})</td><td>${esc(
    timeRange(l, style),
  )}</td><td>${esc(l.topic)}</td><td>${l.room ? esc(l.room) : '—'}</td></tr>`;

const assignmentRow = (a: PortalAssignment): string =>
  `<tr id="trabalho-${esc(a.id)}"><td>${esc(a.title)}</td><td>${a.description ? esc(a.description) : '—'}</td><td>${brDate(
    a.dueDate,
  )} 23:59</td><td class="situacao">${a.status}</td><td>${
    a.grade === null ? '—' : String(a.grade).replace('.', ',')
  }</td></tr>`;

export function coursePage(c: PortalCourse): string {
  return layout(
    c.name,
    `<section class="card curso-header">
  <h1 class="curso-titulo">${esc(c.name)}</h1>
  <dl class="curso-info">
    <dt>Professor(a)</dt><dd>${esc(c.professor)}</dd>
    <dt>Local</dt><dd>${esc(c.room)}</dd>
  </dl>
</section>
<section class="card"><h2>Aulas</h2>
<table class="tabela aulas"><thead><tr><th>Data</th><th>Horário</th><th>Conteúdo</th><th>Sala</th></tr></thead>
<tbody>${c.lessons.map((l) => lessonRow(l, c.timeStyle)).join('\n')}</tbody></table></section>
<section class="card"><h2>Trabalhos</h2>
<table class="tabela trabalhos"><thead><tr><th>Título</th><th>Descrição</th><th>Prazo</th><th>Situação</th><th>Nota</th></tr></thead>
<tbody>${c.assignments.map(assignmentRow).join('\n')}</tbody></table></section>`,
    true,
  );
}

export const notFoundPage = (): string =>
  layout('Não encontrado', '<section class="card"><h1>Página não encontrada</h1></section>', true);
