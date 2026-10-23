import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { buildFixtures } from './fixtures';
import { coursePage, coursesPage, loginPage, notFoundPage } from './views';

export interface PortalOptions {
  user?: string;
  password?: string;
  /** Data de "hoje" (AAAA-MM-DD) usada nas fixtures; por padrão, a data local do computador. */
  today?: () => string;
}

const localToday = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Portal acadêmico de mentira (stand-in da faculdade): só HTML, sem dependências. */
export function createPortalServer(options: PortalOptions = {}): Server {
  const user = options.user ?? process.env.PORTAL_USER ?? 'aluno@portal.local';
  const password = options.password ?? process.env.PORTAL_PASSWORD ?? 'aluno123';
  const today = options.today ?? localToday;
  const sessions = new Set<string>();

  const send = (res: ServerResponse, status: number, html: string, headers: Record<string, string> = {}) => {
    res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...headers });
    res.end(html);
  };
  const redirect = (res: ServerResponse, to: string, headers: Record<string, string> = {}) => {
    res.writeHead(302, { location: to, ...headers });
    res.end();
  };
  const sessionOf = (req: IncomingMessage): string | null =>
    /(?:^|;\s*)portal_sid=([^;]+)/.exec(req.headers.cookie ?? '')?.[1] ?? null;
  const isLogged = (req: IncomingMessage): boolean => {
    const sid = sessionOf(req);
    return sid !== null && sessions.has(sid);
  };
  const readForm = (req: IncomingMessage): Promise<URLSearchParams> =>
    new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk;
        if (body.length > 10_000) req.destroy();
      });
      req.on('end', () => resolve(new URLSearchParams(body)));
      req.on('error', reject);
    });

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://portal.local');
      const path = url.pathname.replace(/\/+$/, '') || '/';
      const method = req.method ?? 'GET';

      if (path === '/' && method === 'GET') return redirect(res, '/disciplinas');

      if (path === '/login' && method === 'GET') return send(res, 200, loginPage());
      if (path === '/login' && method === 'POST') {
        const form = await readForm(req);
        if (form.get('email') === user && form.get('senha') === password) {
          const sid = randomBytes(16).toString('hex');
          sessions.add(sid);
          return redirect(res, '/disciplinas', { 'set-cookie': `portal_sid=${sid}; Path=/; HttpOnly; SameSite=Lax` });
        }
        return send(res, 401, loginPage('Usuário ou senha inválidos'));
      }

      if (path === '/sair' && method === 'GET') {
        const sid = sessionOf(req);
        if (sid) sessions.delete(sid);
        return redirect(res, '/login', { 'set-cookie': 'portal_sid=; Path=/; Max-Age=0' });
      }

      if (method === 'GET' && (path === '/disciplinas' || path.startsWith('/disciplinas/'))) {
        if (!isLogged(req)) return redirect(res, '/login');
        const courses = buildFixtures(today());
        if (path === '/disciplinas') return send(res, 200, coursesPage(courses));
        const course = courses.find((c) => c.id === decodeURIComponent(path.slice('/disciplinas/'.length)));
        return course ? send(res, 200, coursePage(course)) : send(res, 404, notFoundPage());
      }

      return send(res, 404, notFoundPage());
    } catch {
      send(res, 500, '<h1>Erro interno</h1>');
    }
  });
}

// Executado direto (`npm run portal`): sobe na porta PORTAL_PORT (padrão 4010).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORTAL_PORT ?? 4010);
  createPortalServer().listen(port, () => {
    console.log(`Portal mock da faculdade em http://localhost:${port}  (login: ${process.env.PORTAL_USER ?? 'aluno@portal.local'})`);
  });
}
