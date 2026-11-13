import type { GradeItem } from '@edumind/contracts';
import { Calculator, ClipboardList } from 'lucide-react';
import { diffDays, formatDayMonth, relativeDay, todayLocal } from '../lib/dates';
import { describeProjection, fmtNum } from '../lib/grades';
import { useGrades, useSetAssignmentWeight, useSubjectMutations } from '../lib/queries';
import { Empty, ErrorState, SkeletonList } from './ui/bits';
import { NumberField } from './ui/NumberField';
import { useToast } from './ui/Toast';

const STATUS_LABEL: Record<GradeItem['status'], string> = { pendente: 'Pendente', entregue: 'Entregue', corrigido: 'Corrigido' };

function GradeRow({ item, subjectColor }: { item: GradeItem; subjectColor: string }) {
  const setWeight = useSetAssignmentWeight();
  const toast = useToast();
  const overdue = item.status === 'pendente' && diffDays(todayLocal(), item.dueDate) < 0;
  return (
    <li className="item">
      <span className="item-bar" style={{ background: subjectColor }} aria-hidden />
      <div className="item-body">
        <div style={{ fontWeight: 700 }}>{item.title}</div>
        <div className="row-wrap small muted" style={{ marginTop: 2 }}>
          <span>
            {formatDayMonth(item.dueDate)} · {relativeDay(item.dueDate)}
          </span>
          <span className={`badge ${overdue ? 'badge-danger' : item.status === 'pendente' ? 'badge-warning' : 'badge-success'}`}>
            {overdue ? 'Em atraso' : STATUS_LABEL[item.status]}
          </span>
          {item.grade !== null ? <span className="badge badge-info">Nota {fmtNum(item.grade)}</span> : <span>sem nota</span>}
        </div>
      </div>
      <div className="weight-cell">
        <NumberField
          label={`Peso de ${item.title}`}
          hideLabel
          value={item.weight}
          min={0}
          minExclusive
          max={100}
          width={64}
          invalidMessage="O peso precisa ser maior que 0 e no máximo 100."
          onInvalid={(m) => toast.show(m, 'error')}
          onCommit={(weight) => setWeight.mutate({ id: item.id, weight }, { onError: (e) => toast.error(e) })}
        />
        <span className="small muted" aria-label={`${fmtNum(item.share)}% da média`}>
          peso · {fmtNum(item.share)}%
        </span>
      </div>
    </li>
  );
}

/** "Notas e projeção" de uma disciplina: média ponderada, meta e quanto falta tirar. */
export function GradesPanel({ subjectId, subjectColor }: { subjectId: number; subjectColor: string }) {
  const grades = useGrades(subjectId);
  const { update } = useSubjectMutations();
  const toast = useToast();

  if (grades.isLoading) return <SkeletonList n={2} h={72} />;
  if (grades.isError) return <ErrorState error={grades.error} onRetry={() => void grades.refetch()} />;
  const p = grades.data!;

  if (p.items.length === 0) {
    return (
      <div className="card">
        <Empty icon={<ClipboardList size={26} />} title="Sem trabalhos registrados">
          Os trabalhos aparecem aqui depois de sincronizar com a faculdade. Então você poderá ajustar os pesos e ver quanto precisa tirar.
        </Empty>
      </div>
    );
  }

  const text = describeProjection(p);
  const gradedShare = p.totalWeight > 0 ? Math.round((p.gradedWeight / p.totalWeight) * 100) : 0;

  return (
    <div className="stack">
      <section className="card" aria-labelledby="h-proj">
        <div className="card-title card-title-wrap">
          <h2 id="h-proj" className="row" style={{ gap: 8 }}>
            <Calculator size={18} aria-hidden /> Notas e projeção
          </h2>
          <NumberField
            label="Média desejada"
            value={p.target}
            min={0}
            max={10}
            invalidMessage="A média desejada vai de 0 a 10."
            onInvalid={(m) => toast.show(m, 'error')}
            onCommit={(targetAverage) => update.mutate({ id: subjectId, patch: { targetAverage } }, { onError: (e) => toast.error(e) })}
          />
        </div>

        <div className="row-wrap" style={{ gap: 24, alignItems: 'flex-end' }}>
          <div>
            <div className="small muted">Média atual</div>
            <div className="kpi-value" style={{ marginTop: 0 }} data-testid="average">
              {p.average === null ? '—' : fmtNum(p.average)}
            </div>
          </div>
          <div className="small muted">
            {p.gradedCount} de {p.gradedCount + p.remainingCount} trabalhos com nota · {gradedShare}% do peso
          </div>
        </div>

        <div className={`projection tone-${text.tone}`} role="status" style={{ marginTop: 12 }}>
          <strong>{text.headline}</strong>
          <div>{text.detail}</div>
        </div>

        {p.remainingCount > 0 && p.worstCase !== null && p.bestCase !== null && (
          <p className="small muted" style={{ marginTop: 8 }}>
            Média final possível: de <strong>{fmtNum(p.worstCase)}</strong> (zero nos restantes) a <strong>{fmtNum(p.bestCase)}</strong> (10 em todos).
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="h-weights">
        <div className="card-title">
          <h2 id="h-weights">Trabalhos e pesos</h2>
        </div>
        <p className="small muted" style={{ marginBottom: 6 }}>
          Ajuste o peso de cada trabalho conforme o plano de ensino. Padrão: todos com peso 1. A nota, o prazo e a situação vêm da faculdade e não mudam aqui.
        </p>
        <ul className="items" aria-label="Trabalhos e pesos">
          {p.items.map((i) => (
            <GradeRow key={i.id} item={i} subjectColor={subjectColor} />
          ))}
        </ul>
      </section>
    </div>
  );
}
