import type { Message, Thread } from '@edumind/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Bot, History, MessageSquarePlus, Send, Sparkles, Square, Trash2, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Markdown } from '../components/Markdown';
import { Page } from '../components/layout/Page';
import { SubjectDot } from '../components/items';
import { useConfirm } from '../components/ui/Confirm';
import { Modal } from '../components/ui/Modal';
import { Empty, ErrorState, SkeletonList } from '../components/ui/bits';
import { useToast } from '../components/ui/Toast';
import { relativeTime } from '../lib/dates';
import { HELP } from '../lib/help';
import { useConfig, useSubjects, useThread, useThreadMutations, useThreads } from '../lib/queries';
import { streamChat } from '../lib/sse';

interface Streaming {
  userText: string;
  userId?: number;
  assistant: string;
  doneId?: number;
  error?: string;
}

const SUGGESTIONS = ['Explique com um exemplo simples', 'Me dê um exercício para praticar', 'Faça um resumo do essencial'];

function Bubble({ role, children }: { role: 'user' | 'assistant'; children: React.ReactNode }) {
  return (
    <div className={`bubble-row ${role}`}>
      <div className={`bubble ${role}`}>
        {role === 'assistant' && <div className="bubble-who">Prof. Tutor IA</div>}
        {children}
      </div>
    </div>
  );
}

function ThreadList({ threads, activeId, onOpen, onDelete, onNew }: { threads: Thread[]; activeId: number | null; onOpen: (id: number) => void; onDelete: (t: Thread) => void; onNew: () => void }) {
  return (
    <div className="stack-sm">
      <button className="btn btn-primary btn-block" onClick={onNew}>
        <MessageSquarePlus size={18} /> Nova conversa
      </button>
      {threads.length === 0 ? (
        <p className="muted small" style={{ padding: '12px 4px' }}>
          Suas conversas ficam salvas aqui.
        </p>
      ) : (
        <ul className="thread-list">
          {threads.map((t) => (
            <li key={t.id} className={`thread ${t.id === activeId ? 'active' : ''}`}>
              <button className="thread-main" onClick={() => onOpen(t.id)}>
                <span className="truncate" style={{ fontWeight: 600 }}>
                  {t.title ?? 'Nova conversa'}
                </span>
                <span className="row small muted" style={{ gap: 6 }}>
                  {t.subjectName ? (
                    <>
                      <SubjectDot color={t.subjectColor ?? '#999'} /> <span className="truncate">{t.subjectName}</span>
                    </>
                  ) : (
                    'Conversa geral'
                  )}
                  <span>· {relativeTime(t.updatedAt)}</span>
                </span>
              </button>
              <button className="btn btn-ghost btn-icon btn-sm" aria-label={`Excluir conversa: ${t.title ?? 'sem título'}`} onClick={() => onDelete(t)}>
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TutorPage() {
  const params = useParams();
  const threadId = params.threadId ? Number(params.threadId) : null;
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const config = useConfig();
  const subjects = useSubjects();
  const threads = useThreads();
  const thread = useThread(threadId);
  const { create, remove } = useThreadMutations();

  const [draftSubject, setDraftSubject] = useState<number | null>(() => {
    const s = Number(search.get('subject'));
    return Number.isInteger(s) && s > 0 ? s : null;
  });
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState<Streaming | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const busy = streaming !== null && !streaming.error;

  const persisted: Message[] = thread.data?.items ?? [];
  const current = thread.data?.thread;
  const activeSubject = current?.subjectId ?? draftSubject;
  const subjectName = (subjects.data ?? []).find((s) => s.id === activeSubject)?.name;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [persisted.length, streaming?.assistant, streaming?.userText, streaming?.error]);

  // Ao trocar de conversa, limpa o estado de streaming anterior — exceto quando foi esta própria página
  // que acabou de criar a conversa (nova conversa → /tutor/:id) e já está transmitindo a resposta.
  const ownNavigation = useRef<number | null>(null);
  useEffect(() => {
    if (threadId !== null && ownNavigation.current === threadId) {
      ownNavigation.current = null;
      return;
    }
    abortRef.current?.abort();
    setStreaming(null);
  }, [threadId]);

  async function send(content: string) {
    const clean = content.trim();
    if (!clean || busy) return;
    setText('');
    setStreaming({ userText: clean, assistant: '' });
    let tid = threadId;
    try {
      if (tid === null) {
        const t = await create.mutateAsync({ subjectId: draftSubject, title: null });
        tid = t.id;
        ownNavigation.current = tid;
        navigate(`/tutor/${tid}`, { replace: true });
      }
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      let failed = false;
      await streamChat(
        tid,
        clean,
        {
          onUserMessage: (m) => setStreaming((s) => s && { ...s, userId: m.id }),
          onToken: (t) => setStreaming((s) => s && { ...s, assistant: s.assistant + t }),
          onDone: (m) => setStreaming((s) => s && { ...s, doneId: m.id }),
          onError: (e) => {
            failed = true;
            setStreaming((s) => s && { ...s, error: e.message });
          },
        },
        ctrl.signal,
      );
      await Promise.all([qc.invalidateQueries({ queryKey: ['thread', tid] }), qc.invalidateQueries({ queryKey: ['threads'] })]);
      if (!failed) setStreaming(null);
    } catch (e) {
      setStreaming((s) => s && { ...s, error: e instanceof Error ? e.message : 'Não foi possível enviar.' });
    }
  }

  function stop() {
    abortRef.current?.abort();
    // O servidor guarda a resposta parcial; recarrega a conversa.
    if (threadId !== null) void qc.invalidateQueries({ queryKey: ['thread', threadId] });
    void qc.invalidateQueries({ queryKey: ['threads'] });
    setTimeout(() => setStreaming(null), 300);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(text);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(text);
    }
  }

  async function deleteThread(t: Thread) {
    const ok = await confirm({ title: 'Excluir conversa?', message: 'O histórico desta conversa será apagado.', confirmLabel: 'Excluir', danger: true });
    if (!ok) return;
    remove.mutate(t.id, {
      onSuccess: () => {
        if (t.id === threadId) navigate('/tutor', { replace: true });
      },
      onError: (e) => toast.error(e),
    });
  }

  const shown = persisted.filter((m) => m.id !== streaming?.userId && m.id !== streaming?.doneId);
  const isNew = threadId === null;
  const empty = shown.length === 0 && !streaming;

  const list = (
    <ThreadList
      threads={threads.data ?? []}
      activeId={threadId}
      onNew={() => {
        setHistoryOpen(false);
        navigate('/tutor');
      }}
      onOpen={(id) => {
        setHistoryOpen(false);
        navigate(`/tutor/${id}`);
      }}
      onDelete={(t) => void deleteThread(t)}
    />
  );

  return (
    <Page
      title="Chat de Aprendizado"
      help={HELP.tutor}
      actions={
        <button className="btn btn-ghost btn-icon only-mobile" aria-label="Histórico de conversas" onClick={() => setHistoryOpen(true)}>
          <History size={22} />
        </button>
      }
    >
      <div className="tutor-layout">
        <aside className="card only-desktop tutor-side" aria-label="Histórico de conversas">
          <h2 className="section-title">Histórico</h2>
          {threads.isLoading ? <SkeletonList n={3} h={56} /> : list}
        </aside>

        <section className="card chat" aria-label="Conversa com o Professor Tutor">
          {config.data?.aiMode === 'demo' && (
            <div className="demo-banner" role="note">
              <Sparkles size={16} aria-hidden /> Modo demonstração: respostas simuladas. Defina <code>OPENROUTER_API_KEY</code> para usar a IA real.
            </div>
          )}

          <div className="chat-context">
            <Bot size={18} aria-hidden />
            {isNew ? (
              <>
                <label htmlFor="ctx" className="sr-only">
                  Disciplina da conversa
                </label>
                <select id="ctx" className="select select-sm" value={draftSubject ?? ''} onChange={(e) => setDraftSubject(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Conversa geral</option>
                  {(subjects.data ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <span className="truncate small">{current ? (current.subjectName ? `Contexto: ${current.subjectName}` : 'Conversa geral') : '…'}</span>
            )}
          </div>

          <div className="chat-scroll" aria-live="polite">
            {thread.isLoading && threadId !== null && <SkeletonList n={2} h={60} />}
            {thread.isError && <ErrorState error={thread.error} onRetry={() => void thread.refetch()} />}
            {empty && !thread.isLoading && (
              <Empty icon={<Bot size={28} />} title="Olá! Sou o seu Professor Tutor">
                {subjectName ? `Vamos estudar ${subjectName}.` : 'Escolha uma disciplina acima ou pergunte qualquer coisa.'} Faça sua pergunta ou toque em uma sugestão.
                <span className="chips">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} className="chip" type="button" onClick={() => setText(s)}>
                      {s}
                    </button>
                  ))}
                </span>
              </Empty>
            )}
            {shown.map((m) => (
              <Bubble key={m.id} role={m.role}>
                {m.role === 'assistant' ? <Markdown>{m.content}</Markdown> : <p style={{ whiteSpace: 'pre-wrap' }}>{m.content}</p>}
              </Bubble>
            ))}
            {streaming && (
              <>
                {!persisted.some((m) => m.id === streaming.userId) && (
                  <Bubble role="user">
                    <p style={{ whiteSpace: 'pre-wrap' }}>{streaming.userText}</p>
                  </Bubble>
                )}
                {!streaming.error && !persisted.some((m) => m.id === streaming.doneId) && (
                  <Bubble role="assistant">
                    {streaming.assistant ? (
                      <>
                        <Markdown>{streaming.assistant}</Markdown>
                        <span className="caret" aria-hidden />
                      </>
                    ) : (
                      <span className="typing" role="status" aria-label="O Professor Tutor está escrevendo">
                        <i /> <i /> <i />
                      </span>
                    )}
                  </Bubble>
                )}
                {streaming.error && (
                  <Bubble role="assistant">
                    <div className="row" style={{ gap: 8, alignItems: 'flex-start', color: 'var(--danger)' }} role="alert">
                      <TriangleAlert size={18} style={{ flex: 'none', marginTop: 2 }} />
                      <span>{streaming.error}</span>
                    </div>
                    <div className="row-wrap" style={{ marginTop: 8 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => { const t = streaming.userText; setStreaming(null); void send(t); }}>
                        Tentar de novo
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setStreaming(null)}>
                        Dispensar
                      </button>
                    </div>
                  </Bubble>
                )}
              </>
            )}
            <div ref={endRef} />
          </div>

          <form className="composer" onSubmit={onSubmit}>
            <label htmlFor="msg" className="sr-only">
              Sua dúvida
            </label>
            <textarea id="msg" className="textarea composer-input" rows={1} placeholder="Digite sua dúvida aqui..." value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} maxLength={4000} />
            {busy ? (
              <button type="button" className="btn btn-icon send stop" onClick={stop} aria-label="Parar resposta" title="Parar">
                <Square size={18} fill="currentColor" />
              </button>
            ) : (
              <button type="submit" className="btn btn-primary btn-icon send" disabled={!text.trim()} aria-label="Enviar pergunta">
                <Send size={20} />
              </button>
            )}
          </form>
        </section>
      </div>

      {historyOpen && (
        <Modal title="Histórico de conversas" onClose={() => setHistoryOpen(false)}>
          {list}
        </Modal>
      )}
    </Page>
  );
}
