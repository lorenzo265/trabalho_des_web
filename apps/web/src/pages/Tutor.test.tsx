import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeMessage, fakeSubject, fakeThread, jsonError, renderWithProviders, sseResponse, stubApi } from '../test/utils';
import { TutorPage } from './Tutor';

const CONFIG = { appName: 'EduMind', aiMode: 'demo', googleEnabled: false, scraperSource: 'mock' };
const base = (extra: Record<string, unknown> = {}) => ({
  'GET /api/config': CONFIG,
  'GET /api/subjects': { items: [fakeSubject({ id: 1, name: 'Banco de Dados' }), fakeSubject({ id: 2, name: 'Redes' })] },
  'GET /api/chats': { items: [] },
  ...extra,
});
const open = (route = '/tutor') => renderWithProviders(<TutorPage />, { route, path: '/tutor/:threadId?' });
const composer = () => screen.getByLabelText('Sua dúvida');

describe('TutorPage — conversa nova', () => {
  it('mostra as boas-vindas, o aviso de modo demonstração e preenche a sugestão ao clicar', async () => {
    stubApi(base());
    open();
    expect(await screen.findByText('Olá! Sou o seu Professor Tutor')).toBeInTheDocument();
    expect(await screen.findByText(/Modo demonstração/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Explique com um exemplo simples' }));
    expect(composer()).toHaveValue('Explique com um exemplo simples');
  });

  it('sem texto, o botão de enviar fica desabilitado', async () => {
    stubApi(base());
    open();
    const send = await screen.findByRole('button', { name: 'Enviar pergunta' });
    expect(send).toBeDisabled();
    await userEvent.type(composer(), '   ');
    expect(send).toBeDisabled();
    await userEvent.type(composer(), 'Oi');
    expect(send).toBeEnabled();
  });

  it('o seletor oferece conversa geral e as disciplinas; ?subject= já vem escolhido', async () => {
    stubApi(base());
    open('/tutor?subject=2');
    const select = await screen.findByLabelText('Disciplina da conversa');
    await waitFor(() => expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Conversa geral', 'Banco de Dados', 'Redes']));
    await waitFor(() => expect(select).toHaveValue('2'));
    expect(screen.getByText(/Vamos estudar Redes/)).toBeInTheDocument();
  });

  it('primeira pergunta: cria a conversa, vai para /tutor/:id e mostra a resposta em streaming', async () => {
    let sent = false;
    const api = stubApi(
      base({
        'POST /api/chats': fakeThread({ id: 5, subjectId: 2, subjectName: 'Redes', title: null }),
        'GET /api/chats/5/messages': () => ({
          thread: fakeThread({ id: 5, subjectId: 2, subjectName: 'Redes', title: 'Como funciona o TCP?' }),
          items: sent
            ? [fakeMessage({ id: 10, threadId: 5, role: 'user', content: 'Como funciona o TCP?' }), fakeMessage({ id: 11, threadId: 5, role: 'assistant', content: 'O TCP abre a conexão com **três passos**.' })]
            : [],
        }),
        'POST /api/chats/5/messages': () => {
          sent = true;
          return sseResponse([
            { event: 'user', data: fakeMessage({ id: 10, threadId: 5, role: 'user', content: 'Como funciona o TCP?' }) },
            { event: 'token', data: { t: 'O TCP abre a conexão ' } },
            { event: 'token', data: { t: 'com **três passos**.' } },
            { event: 'done', data: fakeMessage({ id: 11, threadId: 5, role: 'assistant', content: 'O TCP abre a conexão com **três passos**.' }) },
          ]);
        },
      }),
    );
    open('/tutor?subject=2');
    await waitFor(() => expect(screen.getByLabelText('Disciplina da conversa')).toHaveValue('2'));
    await userEvent.type(composer(), 'Como funciona o TCP?');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar pergunta' }));

    // cria a conversa com a disciplina escolhida e navega para ela
    await waitFor(() => expect(api.called('POST /api/chats')).toHaveLength(1));
    expect(api.called('POST /api/chats')[0]!.body).toEqual({ subjectId: 2, title: null });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/tutor/5'));

    // envia a pergunta (com a data local, para o Tutor saber o que é "hoje")
    await waitFor(() => expect(api.called('POST /api/chats/5/messages')).toHaveLength(1));
    expect(api.called('POST /api/chats/5/messages')[0]!.body).toMatchObject({ content: 'Como funciona o TCP?' });
    expect((api.called('POST /api/chats/5/messages')[0]!.body as { today: string }).today).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // resposta renderizada como Markdown (negrito vira <strong>) e a caixa de texto esvazia
    const strong = await screen.findByText('três passos');
    expect(strong.tagName).toBe('STRONG');
    expect(screen.getAllByText('Como funciona o TCP?').length).toBeGreaterThan(0);
    expect(composer()).toHaveValue('');
  });

  it('Enter envia; Shift+Enter só quebra a linha', async () => {
    const api = stubApi(
      base({
        'POST /api/chats': fakeThread({ id: 6, title: null }),
        'GET /api/chats/6/messages': { thread: fakeThread({ id: 6 }), items: [] },
        'POST /api/chats/6/messages': () => sseResponse([{ event: 'done', data: fakeMessage({ id: 2, threadId: 6, role: 'assistant', content: 'ok' }) }]),
      }),
    );
    open();
    await userEvent.type(await screen.findByLabelText('Sua dúvida'), 'linha 1{Shift>}{Enter}{/Shift}linha 2');
    expect(composer()).toHaveValue('linha 1\nlinha 2');
    expect(api.called('POST /api/chats')).toHaveLength(0);
    await userEvent.type(composer(), '{Enter}');
    await waitFor(() => expect(api.called('POST /api/chats/6/messages')).toHaveLength(1));
    expect(api.called('POST /api/chats/6/messages')[0]!.body).toMatchObject({ content: 'linha 1\nlinha 2' });
  });
});

describe('TutorPage — falhas e interrupção', () => {
  const failing = (events: Parameters<typeof sseResponse>[0]) =>
    base({
      'GET /api/chats/3/messages': { thread: fakeThread({ id: 3 }), items: [] },
      'POST /api/chats/3/messages': () => sseResponse(events),
    });

  it('erro da IA aparece como alerta; "Tentar de novo" reenvia e "Dispensar" some com a mensagem', async () => {
    const api = stubApi(failing([{ event: 'error', data: { code: 'ai_unavailable', message: 'O Professor Tutor não conseguiu responder agora.' } }]));
    open('/tutor/3');
    await userEvent.type(await screen.findByLabelText('Sua dúvida'), 'Oi{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('O Professor Tutor não conseguiu responder agora.');

    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(api.called('POST /api/chats/3/messages')).toHaveLength(2));
    expect(api.called('POST /api/chats/3/messages')[1]!.body).toMatchObject({ content: 'Oi' });

    await userEvent.click(await screen.findByRole('button', { name: 'Dispensar' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('limite do servidor (429) antes de abrir o stream também vira mensagem amigável', async () => {
    stubApi(
      base({
        'GET /api/chats/3/messages': { thread: fakeThread({ id: 3 }), items: [] },
        'POST /api/chats/3/messages': jsonError(429, 'stream_busy', 'Aguarde o Professor Tutor terminar a resposta anterior.'),
      }),
    );
    open('/tutor/3');
    await userEvent.type(await screen.findByLabelText('Sua dúvida'), 'Oi{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Aguarde o Professor Tutor terminar a resposta anterior.');
  });

  it('"Parar" interrompe a resposta e libera o campo para uma nova pergunta', async () => {
    const api = stubApi(
      base({
        'GET /api/chats/3/messages': { thread: fakeThread({ id: 3 }), items: [] },
        'POST /api/chats/3/messages': () => sseResponse([{ event: 'token', data: { t: 'Vou explicar…' } }], { hang: true }),
      }),
    );
    open('/tutor/3');
    await userEvent.type(await screen.findByLabelText('Sua dúvida'), 'Explique{Enter}');
    const stop = await screen.findByRole('button', { name: 'Parar resposta' });
    expect(await screen.findByText('Vou explicar…')).toBeInTheDocument();
    await userEvent.click(stop);
    expect(await screen.findByRole('button', { name: 'Enviar pergunta' }, { timeout: 2000 })).toBeInTheDocument();
    expect(api.called('POST /api/chats/3/messages')).toHaveLength(1);
  });
});

describe('TutorPage — conversa existente e histórico', () => {
  const threads = {
    items: [
      fakeThread({ id: 3, title: 'O que é normalização?', subjectName: 'Banco de Dados' }),
      fakeThread({ id: 4, title: 'Dúvida geral', subjectId: null, subjectName: null, subjectColor: null }),
    ],
  };

  it('abre a conversa: mensagens do aluno em texto, do Tutor em Markdown, e o contexto da disciplina', async () => {
    stubApi(
      base({
        'GET /api/chats': threads,
        'GET /api/chats/3/messages': {
          thread: threads.items[0],
          items: [fakeMessage({ id: 1, role: 'user', content: 'O que é normalização?' }), fakeMessage({ id: 2, role: 'assistant', content: 'Normalizar é **organizar** as tabelas.\n\n- 1FN\n- 2FN' })],
        },
      }),
    );
    open('/tutor/3');
    expect(await screen.findByText('Contexto: Banco de Dados')).toBeInTheDocument();
    expect((await screen.findByText('organizar')).tagName).toBe('STRONG');
    expect(screen.getAllByRole('listitem').some((li) => li.textContent === '1FN')).toBe(true);
    expect(screen.getByText('Prof. Tutor IA')).toBeInTheDocument();
    expect(screen.queryByText('Olá! Sou o seu Professor Tutor')).not.toBeInTheDocument();
  });

  it('conversa de outra pessoa ou inexistente (404) mostra erro com tentar de novo', async () => {
    stubApi(base({ 'GET /api/chats/99/messages': jsonError(404, 'not_found', 'Conversa não encontrada.') }));
    open('/tutor/99');
    expect(await screen.findByRole('alert')).toHaveTextContent('Conversa não encontrada.');
  });

  it('o histórico lista conversas gerais e por disciplina; abrir leva para a conversa', async () => {
    stubApi(base({ 'GET /api/chats': threads, 'GET /api/chats/4/messages': { thread: threads.items[1], items: [] } }));
    open('/tutor');
    const aside = within(await screen.findByRole('complementary', { name: 'Histórico de conversas' }));
    expect(await aside.findByText('O que é normalização?')).toBeInTheDocument();
    expect(aside.getByText('Banco de Dados')).toBeInTheDocument();
    expect(aside.getByText('Conversa geral')).toBeInTheDocument();
    await userEvent.click(aside.getByRole('button', { name: /^Dúvida geral/ }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/tutor/4'));
  });

  it('excluir pede confirmação; confirmar apaga e, se era a conversa aberta, volta para /tutor', async () => {
    let items = [...threads.items];
    const api = stubApi(
      base({
        'GET /api/chats': () => ({ items }),
        'GET /api/chats/3/messages': { thread: threads.items[0], items: [] },
        'DELETE /api/chats/3': () => ((items = items.filter((t) => t.id !== 3)), null),
      }),
    );
    open('/tutor/3');
    const del = await screen.findByRole('button', { name: 'Excluir conversa: O que é normalização?' });

    await userEvent.click(del);
    expect(screen.getByRole('dialog')).toHaveTextContent('O histórico desta conversa será apagado.');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(api.called('DELETE /api/chats/3')).toHaveLength(0);

    await userEvent.click(del);
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(api.called('DELETE /api/chats/3')).toHaveLength(1));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/tutor$/));
  });
});
