import type { Assignment, Lesson } from '@edumind/contracts';
import { CalendarClock, MapPin } from 'lucide-react';
import { diffDays, formatDayMonth, relativeDay, todayLocal, weekdayShort } from '../lib/dates';

export function SubjectDot({ color }: { color: string }) {
  return <span className="dot" style={{ background: color }} aria-hidden />;
}

export function LessonRow({ lesson, showDate = true }: { lesson: Lesson; showDate?: boolean }) {
  const today = todayLocal();
  const past = diffDays(today, lesson.date) < 0;
  return (
    <li className="item" style={{ opacity: past ? 0.7 : 1 }}>
      <span className="item-bar" style={{ background: lesson.subjectColor }} aria-hidden />
      <div className="item-time">
        <strong>{lesson.start}</strong>
        <span className="muted small">{lesson.end}</span>
      </div>
      <div className="item-body">
        <div className="truncate" style={{ fontWeight: 700 }}>
          {lesson.subjectName}
        </div>
        {lesson.topic && <div className="truncate muted small">{lesson.topic}</div>}
        <div className="row-wrap muted small" style={{ marginTop: 2 }}>
          {lesson.room && (
            <span className="row" style={{ gap: 4 }}>
              <MapPin size={13} aria-hidden /> {lesson.room}
            </span>
          )}
        </div>
      </div>
      {showDate && (
        <div className="item-date small muted">
          <div>{weekdayShort(lesson.date)}</div>
          <div>{formatDayMonth(lesson.date)}</div>
        </div>
      )}
    </li>
  );
}

const STATUS_LABEL: Record<Assignment['status'], string> = {
  pendente: 'Pendente',
  entregue: 'Entregue',
  corrigido: 'Corrigido',
};

export function AssignmentRow({ assignment: a }: { assignment: Assignment }) {
  const today = todayLocal();
  const overdue = a.status === 'pendente' && diffDays(today, a.dueDate) < 0;
  return (
    <li className="item">
      <span className="item-bar" style={{ background: a.subjectColor }} aria-hidden />
      <div className="item-body">
        <div style={{ fontWeight: 700 }}>{a.title}</div>
        <div className="muted small truncate">{a.subjectName}</div>
        <div className="row-wrap small" style={{ marginTop: 4 }}>
          <span className={`row ${overdue ? '' : 'muted'}`} style={{ gap: 4, color: overdue ? 'var(--danger)' : undefined }}>
            <CalendarClock size={13} aria-hidden /> {formatDayMonth(a.dueDate)} · {relativeDay(a.dueDate)}
          </span>
          {a.grade !== null && <span className="badge badge-info">Nota {a.grade.toLocaleString('pt-BR')}</span>}
        </div>
      </div>
      <span className={`badge ${overdue ? 'badge-danger' : a.status === 'pendente' ? 'badge-warning' : 'badge-success'}`}>
        {overdue ? 'Em atraso' : STATUS_LABEL[a.status]}
      </span>
    </li>
  );
}
