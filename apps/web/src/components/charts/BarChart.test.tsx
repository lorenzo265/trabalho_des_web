import { render, screen } from '@testing-library/react';
import { BarChart } from './BarChart';

describe('BarChart', () => {
  it('descreve os valores para leitores de tela e destaca o dia atual', () => {
    render(
      <BarChart
        ariaLabel="Horas por dia"
        data={[
          { label: 'Seg', value: 120, valueLabel: '2 h' },
          { label: 'Ter', value: 0, valueLabel: '0 h', highlight: true },
        ]}
      />,
    );
    expect(screen.getByRole('img', { name: /Horas por dia\. Seg: 2 h; Ter: 0 h/ })).toBeInTheDocument();
  });
});
