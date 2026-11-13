import type { Assignment } from '@edumind/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { remindersStorageKey } from '../lib/reminders';
import { RemindersCard } from './RemindersCard';

const TODAY = '2026-11-06';
const a = (id: number, dueDate: string, over: Partial<Assignment> = {}): Assignment => ({
  id, subjectId: 1, subjectName: 'Banco de Dados', subjectColor: '#2563EB', title: `Trabalho ${id}`,
  description: null, dueDate, status: 'pendente', grade: null, weight: 1, ...over,
});

describe('RemindersCard', () => {
  beforeEach(() => localStorage.clear());

  it('mostra os urgentes com o prazo em palavras e esconde o resto', () => {
    render(<RemindersCard userId={1} today={TODAY} assignments={[a(1, '2026-11-06'), a(2, '2026-11-07'), a(3, '2026-11-20'), a(4, '2026-11-05')]} />);
    const items = within(screen.getByRole('list', { name: 'Lembretes de prazo' })).getAllByRole('listitem');
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining('Trabalho 4'),
      expect.stringContaining('Trabalho 1'),
      expect.stringContaining('Trabalho 2'),
    ]);
    expect(items[0]).toHaveTextContent('venceu ontem');
    expect(items[1]).toHaveTextContent('vence hoje');
    expect(items[2]).toHaveTextContent('vence amanhã');
    expect(screen.queryByText('Trabalho 3')).not.toBeInTheDocument();
  });

  it('não renderiza nada sem lembretes', () => {
    const { container } = render(<RemindersCard userId={1} today={TODAY} assignments={[a(1, '2026-12-30'), a(2, '2026-11-06', { status: 'entregue' })]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('dispensar um lembrete o remove e a escolha sobrevive a recarregar a página', async () => {
    const list = [a(1, '2026-11-06'), a(2, '2026-11-07')];
    const { unmount } = render(<RemindersCard userId={1} today={TODAY} assignments={list} />);
    await userEvent.click(screen.getByRole('button', { name: 'Dispensar lembrete: Trabalho 1' }));
    expect(screen.queryByText('Trabalho 1')).not.toBeInTheDocument();
    expect(screen.getByText('Trabalho 2')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(remindersStorageKey(1))!)).toEqual(['1:today']);

    unmount();
    render(<RemindersCard userId={1} today={TODAY} assignments={list} />);
    expect(screen.queryByText('Trabalho 1')).not.toBeInTheDocument();
    expect(screen.getByText('Trabalho 2')).toBeInTheDocument();
  });

  it('"Dispensar todos" esvazia o cartão; só aparece com 2 ou mais', async () => {
    const { container } = render(<RemindersCard userId={1} today={TODAY} assignments={[a(1, '2026-11-06'), a(2, '2026-11-07')]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Dispensar todos' }));
    expect(container).toBeEmptyDOMElement();
  });

  it('com um só lembrete não oferece "Dispensar todos"', () => {
    render(<RemindersCard userId={1} today={TODAY} assignments={[a(1, '2026-11-06')]} />);
    expect(screen.queryByRole('button', { name: 'Dispensar todos' })).not.toBeInTheDocument();
  });

  it('dispensado hoje reaparece quando a urgência sobe (amanhã → hoje)', () => {
    const list = [a(1, '2026-11-07')];
    localStorage.setItem(remindersStorageKey(1), JSON.stringify(['1:tomorrow']));
    const { unmount } = render(<RemindersCard userId={1} today="2026-11-06" assignments={list} />);
    expect(screen.queryByText('Trabalho 1')).not.toBeInTheDocument(); // dispensado como "amanhã"
    unmount();
    render(<RemindersCard userId={1} today="2026-11-07" assignments={list} />);
    expect(screen.getByText('Trabalho 1')).toBeInTheDocument(); // agora é "hoje": volta
    expect(screen.getByText('vence hoje')).toBeInTheDocument();
  });
});
