'use client';

export default function CalendarView({ history, todayDate, todayTicked }) {
  const [year, month] = todayDate.split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthName = new Date(year, month - 1).toLocaleString('en', { month: 'long' });
  const todayDay = parseInt(todayDate.split('-')[2], 10);

  // Build lookup from history
  const dayStatus = new Map();
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  history.forEach((entry) => {
    if (entry.date && entry.date.startsWith(prefix)) {
      const day = parseInt(entry.date.split('-')[2], 10);
      dayStatus.set(day, { ticked: !!entry.tickedAt, missed: entry.missed });
    }
  });
  dayStatus.set(todayDay, { ticked: todayTicked, missed: false, isToday: true });

  // Build grid cells (Mon=0 start)
  const startOffset = (firstDay + 6) % 7;
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="calendar-card">
      <div className="calendar-header">{monthName} {year}</div>
      <div className="calendar-weekdays">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div key={i} className="weekday">{d}</div>
        ))}
      </div>
      <div className="calendar-grid">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} className="cal-cell empty" />;
          const status = dayStatus.get(day);
          let cls = 'cal-cell';
          if (status?.ticked) cls += ' ticked';
          else if (status?.missed) cls += ' missed';
          if (status?.isToday) cls += ' today';
          if (day > todayDay && !status) cls += ' future';
          return (
            <div key={i} className={cls}>
              <span>{day}</span>
            </div>
          );
        })}
      </div>

      <style jsx>{`
        .calendar-card {
          width: 100%;
          background: var(--bg-card);
          border: 1px solid #ffffff08;
          padding: 18px;
          margin-bottom: 10px;
        }
        .calendar-header {
          font-family: 'Playfair Display', serif;
          font-size: 16px;
          color: var(--gold);
          text-align: center;
          margin-bottom: 12px;
          letter-spacing: 2px;
          text-transform: uppercase;
        }
        .calendar-weekdays {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 4px;
          margin-bottom: 4px;
        }
        .weekday {
          text-align: center;
          font-size: 11px;
          color: var(--text-dim);
          letter-spacing: 1px;
        }
        .calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 4px;
        }
        .cal-cell {
          aspect-ratio: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          color: var(--text-dim);
          border-radius: 4px;
          background: var(--bg);
        }
        .cal-cell.ticked {
          background: var(--green);
          color: var(--cream);
        }
        .cal-cell.missed {
          background: var(--red);
          color: var(--cream);
          opacity: 0.7;
        }
        .cal-cell.today {
          border: 2px solid var(--gold);
        }
        .cal-cell.future {
          opacity: 0.3;
        }
        .cal-cell.empty {
          background: transparent;
        }
      `}</style>
    </div>
  );
}
