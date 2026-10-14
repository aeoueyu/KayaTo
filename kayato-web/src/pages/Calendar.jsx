import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, CreditCard, ListTodo, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';

const dateKey = (value) => {
  if (!value) return '';
  const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  const date = match ? new Date(`${match[0]}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const toDate = (value) => new Date(`${dateKey(value)}T00:00:00`);
const addDays = (date, amount) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
const startOfWeek = (date) => addDays(date, -((date.getDay() + 6) % 7));
const formatDate = (date, options) => new Intl.DateTimeFormat('en-PH', options).format(date);
const extractItems = (data, key) => Array.isArray(data) ? data : data?.[key] || data?.data?.[key] || data?.data || data?.items || [];

function EventButton({ item, compact = false, onSelect }) {
  const Icon = item.kind === 'bill' ? CreditCard : item.teamId ? Users : ListTodo;
  return <button type="button" className={`calendar-event ${item.kind} ${item.teamId ? 'team' : ''}`} onClick={() => onSelect(item)} title={item.title}>
    <Icon size={compact ? 12 : 14} /><span>{item.title}</span>
  </button>;
}

export default function Calendar() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [view, setView] = useState('month');
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([api.get('/tasks'), api.get('/bills')])
      .then(([tasksResponse, billsResponse]) => {
        const tasks = extractItems(tasksResponse.data, 'tasks').filter((task) => dateKey(task.dueDate)).map((task) => ({
          id: task._id || task.id, kind: 'task', title: task.title, date: task.dueDate,
          description: task.description, status: task.status, priority: task.priority,
          progress: task.progress, project: task.project,
          teamId: task.team?._id || task.team || '', teamName: task.team?.name || '',
        }));
        const bills = extractItems(billsResponse.data, 'bills').filter((bill) => dateKey(bill.dueDate)).map((bill) => ({
          id: bill._id || bill.id, kind: 'bill', title: bill.name || bill.title, date: bill.dueDate,
          category: bill.category, amount: bill.amount, currency: bill.currency || 'PHP', status: bill.status,
          billingCycle: bill.billingCycle, officialPaymentUrl: bill.officialPaymentUrl,
        }));
        if (active) setItems([...tasks, ...bills].sort((a, b) => toDate(a.date) - toDate(b.date)));
      })
      .catch((requestError) => { if (active) setError(errorMessage(requestError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const range = useMemo(() => {
    if (view === 'week') { const start = startOfWeek(cursor); return { start, end: addDays(start, 6) }; }
    if (view === 'agenda') return { start: new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()), end: addDays(cursor, 29) };
    return { start: new Date(cursor.getFullYear(), cursor.getMonth(), 1), end: new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0) };
  }, [cursor, view]);
  const periodItems = useMemo(() => items.filter((item) => {
    const date = toDate(item.date);
    return date >= range.start && date <= range.end;
  }), [items, range]);
  const monthDays = useMemo(() => {
    const start = startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [cursor]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(cursor), index)), [cursor]);
  const periodLabel = view === 'month' ? formatDate(cursor, { month: 'long', year: 'numeric' }) : `${formatDate(range.start, { month: 'short', day: 'numeric' })} – ${formatDate(range.end, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  const move = (direction) => setCursor((current) => view === 'month' ? new Date(current.getFullYear(), current.getMonth() + direction, 1) : addDays(current, direction * (view === 'week' ? 7 : 30)));
  const itemsFor = (day) => items.filter((item) => dateKey(item.date) === dateKey(day));
  const openRecord = (item) => {
    setSelected(null);
    if (item.kind === 'bill') navigate(`/app/bills?bill=${item.id}`);
    else navigate(`/app/tasks?task=${item.id}${item.teamId ? `&team=${item.teamId}` : ''}`);
  };

  return <section className="page-block calendar-page">
    <div className="page-heading"><div><h1>Calendar</h1><p>Personal tasks, team deadlines, and bill due dates in one schedule.</p></div></div>
    {error && <p className="form-error page-notice">{error}</p>}
    <section className="panel calendar-panel">
      <div className="calendar-toolbar">
        <div className="calendar-nav">
          <button type="button" className="icon-button" onClick={() => move(-1)} aria-label={`Previous ${view}`}><ChevronLeft size={18} /></button>
          <button type="button" className="button button-secondary button-small" onClick={() => setCursor(new Date())}>Today</button>
          <button type="button" className="icon-button" onClick={() => move(1)} aria-label={`Next ${view}`}><ChevronRight size={18} /></button>
          <h2>{periodLabel}</h2>
        </div>
        <div className="calendar-view-toggle" aria-label="Calendar view">{['month', 'week', 'agenda'].map((option) => <button type="button" key={option} className={view === option ? 'active' : ''} onClick={() => setView(option)}>{option}</button>)}</div>
      </div>
      {loading ? <div className="empty-state"><CalendarDays size={30} /><h2>Loading calendar...</h2><p>Fetching your schedule.</p></div> : <>
        {view === 'month' && <div className="calendar-month">
          <div className="calendar-weekdays">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="calendar-month-grid">{monthDays.map((day) => {
            const events = itemsFor(day); const today = dateKey(day) === dateKey(new Date());
            return <div className={`calendar-day ${day.getMonth() !== cursor.getMonth() ? 'outside' : ''} ${today ? 'today' : ''}`} key={dateKey(day)}>
              <button type="button" className="calendar-day-number" onClick={() => { setCursor(day); setView('agenda'); }}>{day.getDate()}</button>
              <div>{events.slice(0, 3).map((item) => <EventButton key={`${item.kind}-${item.id}`} item={item} compact onSelect={setSelected} />)}{events.length > 3 && <button type="button" className="calendar-more" onClick={() => { setCursor(day); setView('agenda'); }}>+{events.length - 3} more</button>}</div>
            </div>;
          })}</div>
        </div>}
        {view === 'week' && <div className="calendar-week-grid">{weekDays.map((day) => <section key={dateKey(day)} className={dateKey(day) === dateKey(new Date()) ? 'today' : ''}>
          <header><span>{formatDate(day, { weekday: 'short' })}</span><b>{day.getDate()}</b></header>
          <div>{itemsFor(day).map((item) => <EventButton key={`${item.kind}-${item.id}`} item={item} onSelect={setSelected} />)}{!itemsFor(day).length && <small>No events</small>}</div>
        </section>)}</div>}
        {view === 'agenda' && <div className="calendar-agenda">{periodItems.map((item) => <button type="button" key={`${item.kind}-${item.id}`} onClick={() => setSelected(item)}>
          <time>{formatDate(toDate(item.date), { weekday: 'short', month: 'short', day: 'numeric' })}</time>
          <span className={`calendar-agenda-icon ${item.kind} ${item.teamId ? 'team' : ''}`}>{item.kind === 'bill' ? <CreditCard size={17} /> : item.teamId ? <Users size={17} /> : <ListTodo size={17} />}</span>
          <span><b>{item.title}</b><small>{item.kind === 'bill' ? 'Bill due date' : item.teamId ? `Team deadline${item.teamName ? ` · ${item.teamName}` : ''}` : 'Personal task'}</small></span>
        </button>)}</div>}
        {!periodItems.length && <div className="calendar-empty"><CalendarDays size={28} /><b>No events in this period</b><span>Change the date or view to check another schedule period.</span></div>}
      </>}
    </section>
    {selected && <div className="modal-backdrop" onMouseDown={() => setSelected(null)}>
      <section className="modal calendar-event-modal" role="dialog" aria-modal="true" aria-labelledby="calendar-event-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head"><div><span className="eyebrow">{selected.kind === 'bill' ? 'Bill due date' : selected.teamId ? 'Team deadline' : 'Personal task'}</span><h2 id="calendar-event-title">{selected.title}</h2></div><button type="button" onClick={() => setSelected(null)} aria-label="Close event details">×</button></div>
        <div className="event-detail-grid">
          <div><small>Date</small><b>{formatDate(toDate(selected.date), { dateStyle: 'full' })}</b></div><div><small>Status</small><b>{selected.status || 'Scheduled'}</b></div>
          {selected.kind === 'task' && <><div><small>Priority</small><b>{selected.priority || 'Normal'}</b></div><div><small>Progress</small><b>{selected.progress || 0}%</b></div>{selected.teamName && <div><small>Team</small><b>{selected.teamName}</b></div>}{selected.project && <div><small>Project</small><b>{selected.project}</b></div>}</>}
          {selected.kind === 'bill' && <><div><small>Amount</small><b>{new Intl.NumberFormat('en-PH', { style: 'currency', currency: selected.currency }).format(selected.amount || 0)}</b></div><div><small>Category</small><b>{selected.category || 'Bill'}</b></div><div><small>Billing cycle</small><b>{selected.billingCycle?.replace('_', ' ') || 'One time'}</b></div></>}
        </div>
        {selected.description && <p className="event-description">{selected.description}</p>}
        <div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setSelected(null)}>Close</button>{selected.kind === 'bill' && selected.officialPaymentUrl && <a className="button button-secondary" href={selected.officialPaymentUrl} target="_blank" rel="noreferrer">Official site <ArrowUpRight size={15} /></a>}<button type="button" className="button button-primary" onClick={() => openRecord(selected)}>Open {selected.kind === 'bill' ? 'bill' : selected.teamId ? 'team task' : 'task'} <ArrowUpRight size={15} /></button></div>
      </section>
    </div>}
  </section>;
}
