import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, stubApi } from '../test/utils';
import { GradesPanel } from './GradesPanel';

const projection = (over: Record<string, unknown> = {}) => ({
  subjectId: 7, target: 7, average: 8, totalWeight: 3, gradedWeight: 1, remainingWeight: 2, gradedCount: 1, remainingCount: 2,
  needed: 6.5, worstCase: 2.67, bestCase: 9.33, status: 'on_track',
  items: [
    { id: 1, title: 'Prova 1', dueDate: '2026-10-01', status: 'corrigido', grade: 8, weight: 1, share: 33.3 },
    { id: 2, title: 'Trabalho 2', dueDate: '2026-11-20', status: 'pendente', grade: null, weight: 2, share: 66.7 },
  ],
  ...over,
});
const subject = (over: Record<string, unknown> = {}) => ({
  id: 7, name: 'BD', professor: null, room: null, color: '#2563EB', source: 'manual', createdAt: '2026-01-01T00:00:00.000Z', topicCount: 0, doneCount: 0, targetAverage: 7, ...over,
});

describe('GradesPanel', () => {
  it('mostra a média, a mensagem da projeção e a faixa possível', async () => {
    stubApi({ 'GET /api/subjects/7/grades': projection() });
    renderWithProviders(<GradesPanel subjectId={7} subjectColor="#2563EB" />);
    expect(await screen.findByTestId('average')).toHaveTextContent('8');
    const box = screen.getByText('Precisa de 6,5 nos restantes').closest('.projection')!;
    expect(box).toHaveClass('tone-success');
    expect(box).toHaveTextContent('manter o ritmo basta');
    const range = screen.getByText(/Média final possível/);
    expect(range).toHaveTextContent('de 2,67 (zero nos restantes) a 9,33 (10 em todos)');
    expect(screen.getByText('1 de 3 trabalhos com nota · 33% do peso')).toBeInTheDocument();
    const list = within(screen.getByRole('list', { name: 'Trabalhos e pesos' }));
    expect(list.getByText('Prova 1')).toBeInTheDocument();
    expect(list.getByText('Nota 8')).toBeInTheDocument();
    expect(list.getByText('sem nota')).toBeInTheDocument();
    expect(list.getByLabelText('Peso de Trabalho 2')).toHaveValue('2');
  });

  it('mostra "—" quando ainda não há nota lançada', async () => {
    stubApi({ 'GET /api/subjects/7/grades': projection({ average: null, gradedCount: 0, gradedWeight: 0, status: 'possible', needed: 7 }) });
    renderWithProviders(<GradesPanel subjectId={7} subjectColor="#2563EB" />);
    expect(await screen.findByTestId('average')).toHaveTextContent('—');
  });

  it('alterar a média desejada envia só o campo certo e aceita vírgula', async () => {
    const api = stubApi({ 'GET /api/subjects/7/grades': projection(), 'PATCH /api/subjects/7': subject({ targetAverage: 8.5 }) });
    renderWithProviders(<GradesPanel subjectId={7} subjectColor="#2563EB" />);
    const field = await screen.findByLabelText('Média desejada');
    await userEvent.clear(field);
    await userEvent.type(field, '8,5{Enter}');
    await waitFor(() => expect(api.called('PATCH /api/subjects/7')).toHaveLength(1));
    expect(api.called('PATCH /api/subjects/7')[0]!.body).toEqual({ targetAverage: 8.5 });
  });

  it('média fora de 0–10 volta ao valor anterior, avisa e não chama a API', async () => {
    const api = stubApi({ 'GET /api/subjects/7/grades': projection() });
    renderWithProviders(<GradesPanel subjectId={7} subjectColor="#2563EB" />);
    const field = await screen.findByLabelText('Média desejada');
    await userEvent.clear(field);
    await userEvent.type(field, '11{Enter}');
    expect(await screen.findByText('A média desejada vai de 0 a 10.')).toBeInTheDocument();
    expect(field).toHaveValue('7');
    expect(api.called('PATCH /api/subjects/7')).toHaveLength(0);
  });

  it('alterar o peso de um trabalho envia o peso e recarrega a projeção', async () => {
    let weight = 2;
    const api = stubApi({
      'GET /api/subjects/7/grades': () => projection({ items: [{ id: 2, title: 'Trabalho 2', dueDate: '2026-11-20', status: 'pendente', grade: null, weight, share: 100 }] }),
      'PATCH /api/assignments/2': (c) => ((weight = (c.body as { weight: number }).weight), { id: 2, subjectId: 7, subjectName: 'BD', subjectColor: '#2563EB', title: 'Trabalho 2', description: null, dueDate: '2026-11-20', status: 'pendente', grade: null, weight }),
    });
    renderWithProviders(<GradesPanel subjectId={7} subjectColor="#2563EB" />);
    const field = await screen.findByLabelText('Peso de Trabalho 2');
    await userEvent.clear(field);
    await userEvent.type(field, '2,5');
    await userEvent.tab(); // sair do campo confirma
    await waitFor(() => expect(api.called('PATCH /api/assignments/2')).toHaveLength(1));
    expect(api.called('PATCH /api/assignments/2')[0]!.body).toEqual({ weight: 2.5 });
    await waitFor(() => expect(api.called('GET /api/subjects/7/grades').length).toBeGreaterThan(1));
    expect(await screen.findByLabelText('Peso de Trabalho 2')).toHaveValue('2,5');
  });

  it.each(['0', '101', 'abc', ''])('peso inválido (%j) é recusado sem chamar a API', async (typed) => {
    const api = stubApi({ 'GET /api/subjects/7/grades': projection() });
    renderWithProviders(<GradesPanel subjectId={7} subjectColor="#2563EB" />);
    const field = await screen.findByLabelText('Peso de Trabalho 2');
    await userEvent.clear(field);
    if (typed) await userEvent.type(field, typed);
    await userEvent.tab();
    expect(await screen.findByText('O peso precisa ser maior que 0 e no máximo 100.')).toBeInTheDocument();
    expect(field).toHaveValue('2');
    expect(api.calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);
  });

  it('não chama a API se o valor não mudou, e Esc descarta a edição', async () => {
    const api = stubApi({ 'GET /api/subjects/7/grades': projection() });
    renderWithProviders(<GradesPanel subjectId={7} subjectColor="#2563EB" />);
    const field = await screen.findByLabelText('Peso de Trabalho 2');
    await userEvent.click(field);
    await userEvent.tab();
    expect(api.calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);

    await userEvent.clear(field);
    await userEvent.type(field, '9{Escape}');
    expect(field).toHaveValue('2');
    expect(api.calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);
  });

  it('sem trabalhos, explica como chegar lá', async () => {
    stubApi({ 'GET /api/subjects/7/grades': projection({ items: [], status: 'no_data', average: null, needed: null, worstCase: null, bestCase: null, totalWeight: 0, gradedWeight: 0, remainingWeight: 0, gradedCount: 0, remainingCount: 0 }) });
    renderWithProviders(<GradesPanel subjectId={7} subjectColor="#2563EB" />);
    expect(await screen.findByText('Sem trabalhos registrados')).toBeInTheDocument();
    expect(screen.queryByLabelText('Média desejada')).not.toBeInTheDocument();
  });

  it('erro da API vira estado de erro', async () => {
    stubApi({});
    renderWithProviders(<GradesPanel subjectId={7} subjectColor="#2563EB" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('sem rota no teste: GET /api/subjects/7/grades');
  });
});
