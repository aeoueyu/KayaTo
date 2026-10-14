import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, CreditCard, ListTodo, Pencil, Plus, Save, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api, errorMessage } from '../lib/api';
import { dateOnlyKey, formatCalendarDate, formatCurrency, normalizeCurrency, normalizeTimeZone, todayInTimeZone } from '../lib/formatters';

const dateKey = dateOnlyKey;
const toDate = (value) => new Date(`${dateKey(value)}T00:00:00`);
const addDays = (date, amount) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
const startOfWeek = (date) => addDays(date, -((date.getDay() + 6) % 7));
const formatDate = (date, options) => formatCalendarDate(date, options);
const extractItems = (data, key) => Array.isArray(data) ? data : data?.[key] || data?.data?.[key] || data?.data || data?.items || [];
const taskStatusOptions = [['todo', 'To do'], ['in-progress', 'In progress'], ['review', 'For review'], ['done', 'Completed']];
const taskTransitions = { todo: ['todo', 'in-progress'], 'in-progress': ['todo', 'in-progress', 'review'], review: ['in-progress', 'review', 'done'], done: ['review', 'done'] };
const billStatusOptions = [['unpaid', 'Unpaid'], ['paid', 'Paid'], ['overdue', 'Overdue'], ['skipped', 'Skipped']];

function EventButton({ item, compact = false, onSelect }) {
  const Icon = item.kind === 'bill' ? CreditCard : item.teamId ? Users : ListTodo;
  return <button type="button" className={`calendar-event ${item.kind} ${item.teamId ? 'team' : ''}`} onClick={() => onSelect(item)} title={item.title}>
    <Icon size={compact ? 12 : 14} /><span>{item.title}</span>
  </button>;
}

export default function Calendar() {
  const { user } = useAuth();
  const timeZone = normalizeTimeZone(user?.timezone);
  const currency = normalizeCurrency(user?.currency);
  const today = useMemo(() => todayInTimeZone(timeZone), [timeZone]);
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [view, setView] = useState('month');
  const [cursor, setCursor] = useState(() => today);
  const [selected, setSelected] = useState(null);
  const [editor, setEditor] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadItems = useCallback(async () => {
    setError('');
    try {
      const [tasksResponse, billsResponse] = await Promise.all([api.get('/tasks'), api.get('/bills')]);
        const tasks = extractItems(tasksResponse.data, 'tasks').filter((task) => dateKey(task.dueDate)).map((task) => ({
          id: task._id || task.id, kind: 'task', title: task.title, date: task.dueDate,
          description: task.description, status: task.status, priority: task.priority,
          progress: task.progress, project: task.project, taskType: task.taskType,
          teamId: task.team?._id || task.team || '', teamName: task.team?.name || '',
        }));
        const bills = extractItems(billsResponse.data, 'bills').filter((bill) => dateKey(bill.dueDate)).map((bill) => ({
          id: bill._id || bill.id, kind: 'bill', title: bill.name || bill.title, date: bill.dueDate,
          category: bill.category, amount: bill.amount, currency: bill.currency || currency, status: bill.status,
          billingCycle: bill.billingCycle, officialPaymentUrl: bill.officialPaymentUrl,
        }));
      setItems([...tasks, ...bills].sort((a, b) => toDate(a.date) - toDate(b.date)));
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setLoading(false); }
  }, [currency]);
  useEffect(() => { loadItems(); }, [loadItems]);

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
  const periodLabel = view === 'month' ? formatDate(cursor, { month: 'long', year: 'numeric' }) : `${formatDate(range.start, { month: 'short', day: 'numeric' })} - ${formatDate(range.end, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  const move = (direction) => setCursor((current) => view === 'month' ? new Date(current.getFullYear(), current.getMonth() + direction, 1) : addDays(current, direction * (view === 'week' ? 7 : 30)));
  const itemsFor = (day) => items.filter((item) => dateKey(item.date) === dateKey(day));
  const openCreate = (date = cursor) => setEditor({ mode: 'create', kind: 'task', date: dateKey(date) });
  const openEdit = (item) => { setSelected(null); setEditor({ mode: 'edit', kind: item.kind, date: dateKey(item.date), item }); };
  const openRecord = (item) => {
    setSelected(null);
    if (item.kind === 'bill') navigate(`/app/bills?bill=${item.id}`);
    else navigate(`/app/tasks?task=${item.id}${item.teamId ? `&team=${item.teamId}` : ''}`);
  };

  return <section className="page-block calendar-page">
    <div className="page-heading"><div><h1>Calendar</h1><p>Create, update, and review personal tasks, team deadlines, and bill due dates.</p></div><button type="button" className="button button-primary" onClick={() => openCreate()}><Plus size={17} /> Add event</button></div>
    {error && <p className="form-error page-notice">{error}</p>}
    <section className="panel calendar-panel">
      <div className="calendar-toolbar">
        <div className="calendar-nav">
          <button type="button" className="icon-button" onClick={() => move(-1)} aria-label={`Previous ${view}`}><ChevronLeft size={18} /></button>
          <button type="button" className="button button-secondary button-small" onClick={() => setCursor(today)}>Today</button>
          <button type="button" className="icon-button" onClick={() => move(1)} aria-label={`Next ${view}`}><ChevronRight size={18} /></button>
          <h2>{periodLabel}</h2>
        </div>
        <div className="calendar-view-toggle" aria-label="Calendar view">{['month', 'week', 'agenda'].map((option) => <button type="button" key={option} className={view === option ? 'active' : ''} onClick={() => setView(option)}>{option}</button>)}</div>
      </div>
      {loading ? <div className="empty-state"><CalendarDays size={30} /><h2>Loading calendar...</h2><p>Fetching your schedule.</p></div> : <>
        {view === 'month' && <div className="calendar-month">
          <div className="calendar-weekdays">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="calendar-month-grid">{monthDays.map((day) => {
            const events = itemsFor(day); const isToday = dateKey(day) === dateKey(today);
            return <div className={`calendar-day ${day.getMonth() !== cursor.getMonth() ? 'outside' : ''} ${isToday ? 'today' : ''}`} key={dateKey(day)}>
              <div className="calendar-day-head"><button type="button" className="calendar-day-number" onClick={() => { setCursor(day); setView('agenda'); }}>{day.getDate()}</button><button type="button" className="calendar-add-day" onClick={() => openCreate(day)} aria-label={`Add event on ${formatDate(day, { dateStyle: 'long' })}`}><Plus size={14} /></button></div>
              <div>{events.slice(0, 3).map((item) => <EventButton key={`${item.kind}-${item.id}`} item={item} compact onSelect={setSelected} />)}{events.length > 3 && <button type="button" className="calendar-more" onClick={() => { setCursor(day); setView('agenda'); }}>+{events.length - 3} more</button>}</div>
            </div>;
          })}</div>
        </div>}
        {view === 'week' && <div className="calendar-week-grid">{weekDays.map((day) => <section key={dateKey(day)} className={dateKey(day) === dateKey(today) ? 'today' : ''}>
          <header><span>{formatDate(day, { weekday: 'short' })}</span><b>{day.getDate()}</b><button type="button" className="calendar-week-add" onClick={() => openCreate(day)} aria-label={`Add event on ${formatDate(day, { dateStyle: 'long' })}`}><Plus size={13} /> Add</button></header>
          <div>{itemsFor(day).map((item) => <EventButton key={`${item.kind}-${item.id}`} item={item} onSelect={setSelected} />)}{!itemsFor(day).length && <small>No events</small>}</div>
        </section>)}</div>}
        {view === 'agenda' && <div className="calendar-agenda">{periodItems.map((item) => <button type="button" key={`${item.kind}-${item.id}`} onClick={() => setSelected(item)}>
          <time>{formatDate(toDate(item.date), { weekday: 'short', month: 'short', day: 'numeric' })}</time>
          <span className={`calendar-agenda-icon ${item.kind} ${item.teamId ? 'team' : ''}`}>{item.kind === 'bill' ? <CreditCard size={17} /> : item.teamId ? <Users size={17} /> : <ListTodo size={17} />}</span>
          <span><b>{item.title}</b><small>{item.kind === 'bill' ? 'Bill due date' : item.teamId ? `Team deadline${item.teamName ? ` · ${item.teamName}` : ''}` : 'Personal task'}</small></span>
        </button>)}</div>}
        {!periodItems.length && <div className="calendar-empty"><CalendarDays size={28} /><b>No events in this period</b><span>Add an event here or change the date to check another schedule period.</span><button type="button" className="button button-secondary button-small" onClick={() => openCreate(range.start)}><Plus size={15} /> Add event</button></div>}
      </>}
    </section>
    {selected && <div className="modal-backdrop" onMouseDown={() => setSelected(null)}>
      <section className="modal calendar-event-modal" role="dialog" aria-modal="true" aria-labelledby="calendar-event-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head"><div><span className="eyebrow">{selected.kind === 'bill' ? 'Bill due date' : selected.teamId ? 'Team deadline' : 'Personal task'}</span><h2 id="calendar-event-title">{selected.title}</h2></div><button type="button" onClick={() => setSelected(null)} aria-label="Close event details">×</button></div>
        <div className="event-detail-grid">
          <div><small>Date</small><b>{formatDate(toDate(selected.date), { dateStyle: 'full' })}</b></div><div><small>Status</small><b>{selected.status || 'Scheduled'}</b></div>
          {selected.kind === 'task' && <><div><small>Priority</small><b>{selected.priority || 'Normal'}</b></div><div><small>Progress</small><b>{selected.progress || 0}%</b></div>{selected.teamName && <div><small>Team</small><b>{selected.teamName}</b></div>}{selected.project && <div><small>Project</small><b>{selected.project}</b></div>}</>}
          {selected.kind === 'bill' && <><div><small>Amount</small><b>{formatCurrency(selected.amount, currency)}</b></div><div><small>Category</small><b>{selected.category || 'Bill'}</b></div><div><small>Billing cycle</small><b>{selected.billingCycle?.replace('_', ' ') || 'One time'}</b></div></>}
        </div>
        {selected.description && <p className="event-description">{selected.description}</p>}
        <div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setSelected(null)}>Close</button>{selected.kind === 'bill' && selected.officialPaymentUrl && <a className="button button-secondary" href={selected.officialPaymentUrl} target="_blank" rel="noreferrer">Official site <ArrowUpRight size={15} /></a>}<button type="button" className="button button-secondary" onClick={() => openEdit(selected)}><Pencil size={15} /> Edit</button><button type="button" className="button button-primary" onClick={() => openRecord(selected)}>Open {selected.kind === 'bill' ? 'bill' : selected.teamId ? 'team task' : 'task'} <ArrowUpRight size={15} /></button></div>
      </section>
    </div>}
    {editor && <CalendarEditor editor={editor} currency={currency} onClose={() => setEditor(null)} onSaved={async () => { await loadItems(); setEditor(null); }} />}
  </section>;
}

function CalendarEditor({ editor, currency, onClose, onSaved }) {
  const existing = editor.item;
  const initialForm = (kind, date = editor.date) => kind === 'bill' ? {
    title: existing?.title || '', date, category: existing?.category || 'Utilities', amount: existing?.amount ?? '',
    billingCycle: existing?.billingCycle || 'monthly', status: existing?.status || 'unpaid', officialPaymentUrl: existing?.officialPaymentUrl || '',
  } : {
    title: existing?.title || '', date, description: existing?.description || '', project: existing?.project || 'Personal',
    priority: existing?.priority || 'medium', status: existing?.status || 'todo', progress: existing?.progress ?? 0,
  };
  const [kind, setKind] = useState(editor.kind);
  const [form, setForm] = useState(() => initialForm(editor.kind));
  const [errors, setErrors] = useState({});
  const [requestError, setRequestError] = useState('');
  const [busy, setBusy] = useState(false);

  const switchKind = (nextKind) => {
    if (editor.mode === 'edit' || nextKind === kind) return;
    setKind(nextKind);
    setForm(initialForm(nextKind, form.date));
    setErrors({});
    setRequestError('');
  };
  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
  };
  const validate = () => {
    const next = {};
    const title = form.title.trim();
    const titleLimit = kind === 'bill' ? 120 : 180;
    if (!title) next.title = kind === 'bill' ? 'Enter the biller name.' : 'Enter a task title.';
    else if (title.length > titleLimit) next.title = `Use ${titleLimit} characters or fewer.`;
    if (!form.date) next.date = 'Choose a due date.';
    if (kind === 'task') {
      if (form.project.trim().length > 120) next.project = 'Use 120 characters or fewer.';
      if (form.description.trim().length > 5000) next.description = 'Use 5,000 characters or fewer.';
      const progress = Number(form.progress);
      if (!Number.isFinite(progress) || progress < 0 || progress > 100) next.progress = 'Enter a value from 0 to 100.';
    } else {
      const amount = Number(form.amount);
      if (form.amount === '' || !Number.isFinite(amount) || amount < 0) next.amount = 'Enter a valid amount of 0 or higher.';
      if (form.officialPaymentUrl && !/^https:\/\//i.test(form.officialPaymentUrl)) next.officialPaymentUrl = 'Use a secure URL beginning with https://.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };
  const submit = async (event) => {
    event.preventDefault();
    if (!validate()) return;
    setBusy(true);
    setRequestError('');
    try {
      const payload = kind === 'bill' ? {
        name: form.title.trim(), dueDate: form.date, category: form.category.trim() || 'Other', amount: Number(form.amount),
        currency, billingCycle: form.billingCycle, status: form.status, officialPaymentUrl: form.officialPaymentUrl.trim(),
      } : {
        title: form.title.trim(), dueDate: form.date, description: form.description.trim(), project: form.project.trim() || 'Personal',
        priority: form.priority, status: form.status, progress: form.status === 'done' ? 100 : Number(form.progress),
        ...(editor.mode === 'create' ? { taskType: 'personal' } : {}),
      };
      const baseUrl = kind === 'bill' ? '/bills' : '/tasks';
      if (editor.mode === 'edit') await api.patch(`${baseUrl}/${existing.id}`, payload);
      else await api.post(baseUrl, payload);
      await onSaved();
    } catch (requestFailure) {
      setRequestError(errorMessage(requestFailure, `Unable to ${editor.mode === 'edit' ? 'update' : 'create'} this ${kind}.`));
    } finally { setBusy(false); }
  };
  const allowedStatuses = editor.mode === 'edit' ? taskTransitions[existing.status] || [existing.status] : taskStatusOptions.map(([value]) => value);

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <form className="modal calendar-editor-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()} noValidate>
      <div className="modal-head"><div><span className="eyebrow">{editor.mode === 'edit' ? 'Update calendar event' : 'New calendar event'}</span><h2>{editor.mode === 'edit' ? `Edit ${kind}` : 'Add to calendar'}</h2><p>{editor.mode === 'edit' ? 'Changes are saved to the original record.' : 'Create a task or bill reminder without leaving the calendar.'}</p></div><button type="button" onClick={onClose} aria-label="Close calendar editor">×</button></div>
      {editor.mode === 'create' && <div className="type-select calendar-kind-select" aria-label="Event type">
        <button type="button" className={kind === 'task' ? 'selected' : ''} onClick={() => switchKind('task')}><ListTodo size={18} /><b>Task</b><small>Personal work or deadline</small></button>
        <button type="button" className={kind === 'bill' ? 'selected' : ''} onClick={() => switchKind('bill')}><CreditCard size={18} /><b>Bill reminder</b><small>Amount and due date</small></button>
      </div>}
      {requestError && <p className="form-error">{requestError}</p>}
      <div className="calendar-editor-fields">
        <label className="field-label"><span>{kind === 'bill' ? 'Biller name' : 'Task title'} *</span><input value={form.title} maxLength={kind === 'bill' ? 120 : 180} aria-invalid={Boolean(errors.title)} onChange={(event) => update('title', event.target.value)} />{errors.title && <small className="field-error">{errors.title}</small>}</label>
        <label className="field-label"><span>Due date *</span><input type="date" value={form.date} aria-invalid={Boolean(errors.date)} onChange={(event) => update('date', event.target.value)} />{errors.date && <small className="field-error">{errors.date}</small>}</label>
        {kind === 'task' ? <>
          <div className="form-grid">
            <label className="field-label"><span>Project</span><input value={form.project} maxLength="120" aria-invalid={Boolean(errors.project)} onChange={(event) => update('project', event.target.value)} />{errors.project && <small className="field-error">{errors.project}</small>}</label>
            <label className="field-label"><span>Priority</span><select value={form.priority} onChange={(event) => update('priority', event.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
            <label className="field-label"><span>Status</span><select value={form.status} onChange={(event) => update('status', event.target.value)}>{taskStatusOptions.filter(([value]) => allowedStatuses.includes(value)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{editor.mode === 'edit' && <small className="field-help">Workflow stages move one step at a time.</small>}</label>
            <label className="field-label"><span>Progress (%)</span><input type="number" min="0" max="100" value={form.status === 'done' ? 100 : form.progress} disabled={form.status === 'done'} aria-invalid={Boolean(errors.progress)} onChange={(event) => update('progress', event.target.value)} />{errors.progress && <small className="field-error">{errors.progress}</small>}</label>
          </div>
          <label className="field-label"><span>Description</span><textarea rows="4" maxLength="5000" value={form.description} aria-invalid={Boolean(errors.description)} onChange={(event) => update('description', event.target.value)} />{errors.description && <small className="field-error">{errors.description}</small>}</label>
          {existing?.teamId && <p className="calendar-editor-note"><Users size={15} /> This remains a team task for {existing.teamName || 'its current team'}.</p>}
        </> : <>
          <div className="form-grid">
            <label className="field-label"><span>Amount ({currency}) *</span><input type="number" min="0" step="0.01" value={form.amount} aria-invalid={Boolean(errors.amount)} onChange={(event) => update('amount', event.target.value)} />{errors.amount && <small className="field-error">{errors.amount}</small>}</label>
            <label className="field-label"><span>Category</span><input value={form.category} maxLength="80" onChange={(event) => update('category', event.target.value)} /></label>
            <label className="field-label"><span>Billing cycle</span><select value={form.billingCycle} onChange={(event) => update('billingCycle', event.target.value)}><option value="one_time">One time</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></select></label>
            <label className="field-label"><span>Status</span><select value={form.status} onChange={(event) => update('status', event.target.value)}>{billStatusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>
          <label className="field-label"><span>Official payment URL (optional)</span><input type="url" placeholder="https://" value={form.officialPaymentUrl} aria-invalid={Boolean(errors.officialPaymentUrl)} onChange={(event) => update('officialPaymentUrl', event.target.value)} />{errors.officialPaymentUrl && <small className="field-error">{errors.officialPaymentUrl}</small>}</label>
          <p className="calendar-editor-note"><CreditCard size={15} /> KayaTo stores reminders only and never processes payments.</p>
        </>}
      </div>
      <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}><Save size={16} /> {busy ? 'Saving...' : editor.mode === 'edit' ? 'Save changes' : `Create ${kind}`}</button></div>
    </form>
  </div>;
}
