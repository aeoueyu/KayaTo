import { ArrowUpRight, CalendarDays, Check, CreditCard, Plus, ReceiptText, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api, errorMessage } from '../lib/api';
import { currencyLabel, formatCalendarDate, formatCurrency, normalizeCurrency } from '../lib/formatters';

const initial = { name: '', category: 'Utilities', amount: '', dueDate: '', billingCycle: 'monthly', officialPaymentUrl: '' };
const billCategories = ['Utilities', 'Internet', 'Mobile', 'Rent', 'Subscription', 'Insurance', 'Loan', 'Education', 'Healthcare', 'Transportation', 'Other'];
const date = (value) => formatCalendarDate(value, { month: 'short', day: 'numeric', year: 'numeric' });

export default function Bills() {
  const { user } = useAuth();
  const currency = normalizeCurrency(user?.currency);
  const [searchParams, setSearchParams] = useSearchParams();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [show, setShow] = useState(false);
  const selectedBill = bills.find((bill) => String(bill._id) === searchParams.get('bill'));

  const load = async () => {
    try { const { data } = await api.get('/bills'); setBills(data); }
    catch (requestError) { setError(errorMessage(requestError)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const closeDetails = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('bill');
    setSearchParams(next, { replace: true });
  };
  const openDetails = (bill) => {
    const next = new URLSearchParams(searchParams);
    next.set('bill', bill._id);
    setSearchParams(next);
  };
  const markPaid = async (bill) => {
    try {
      const { data } = await api.patch(`/bills/${bill._id}`, { status: 'paid' });
      setBills((current) => current.map((item) => item._id === data._id ? data : item));
    } catch (requestError) { setError(errorMessage(requestError)); }
  };
  const remove = async (bill) => {
    try {
      await api.delete(`/bills/${bill._id}`);
      setBills((current) => current.filter((item) => item._id !== bill._id));
      if (selectedBill?._id === bill._id) closeDetails();
    } catch (requestError) { setError(errorMessage(requestError)); }
  };
  const total = bills.filter((bill) => bill.status !== 'paid').reduce((sum, bill) => sum + bill.amount, 0);

  return <section className="page-block">
    <div className="page-heading"><div><h1>Bills & reminders</h1><p>Track deadlines and continue payments only on official biller websites.</p></div><button className="button button-primary" onClick={() => setShow(true)}><Plus size={17} /> Add bill</button></div>
    {error && <p className="form-error page-notice">{error}</p>}
    <div className="bill-summary"><div><span className="bill-summary-icon"><ReceiptText size={22} /></span><div><small>Upcoming total</small><strong>{formatCurrency(total, currency)}</strong><p>{bills.filter((bill) => bill.status !== 'paid').length} unpaid reminders</p></div></div><div className="currency-card"><small>Display currency</small><b>{currencyLabel(currency)}</b><p>Change this in Account settings.</p></div></div>
    <section className="panel">
      <div className="panel-heading"><div><h2>Payment reminders</h2><span>Sorted by due date</span></div><CalendarDays size={19} /></div>
      {loading ? <div className="app-loading">Loading reminders...</div> : <div className="bill-list">
        {bills.map((bill) => <article className={`bill-row ${bill.status} ${selectedBill?._id === bill._id ? 'selected-record' : ''}`} key={bill._id}>
          <button type="button" className="bill-record-button" onClick={() => openDetails(bill)} aria-label={`View ${bill.name} details`}><span className="bill-logo"><CreditCard size={19} /></span><span className="bill-name"><b>{bill.name}</b><small>{bill.category} · {bill.billingCycle.replace('_', ' ')}</small></span></button>
          <div className="bill-date"><small>Due date</small><b>{date(bill.dueDate)}</b></div>
          <div className="bill-amount"><b>{formatCurrency(bill.amount, currency)}</b><span className={`status-pill ${bill.status === 'paid' ? 'success' : 'neutral'}`}>{bill.status}</span></div>
          <div className="bill-actions">{bill.status !== 'paid' && <button className="button button-secondary button-small" onClick={() => markPaid(bill)}><Check size={15} /> Mark paid</button>}{bill.officialPaymentUrl && <a className="button button-primary button-small" href={bill.officialPaymentUrl} target="_blank" rel="noreferrer">Official site <ArrowUpRight size={15} /></a>}<button className="icon-button" onClick={() => remove(bill)} aria-label={`Delete ${bill.name}`}><Trash2 size={17} /></button></div>
        </article>)}
        {!bills.length && <div className="empty-state"><ReceiptText size={28} /><h3>No bill reminders yet</h3><p>Add one to see upcoming totals and due dates here.</p></div>}
      </div>}
    </section>
    {show && <BillForm currency={currency} onClose={() => setShow(false)} onCreated={(bill) => { setBills((current) => [...current, bill].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))); setShow(false); }} />}
    {selectedBill && <BillDetails bill={selectedBill} currency={currency} onClose={closeDetails} onPaid={markPaid} />}
  </section>;
}

function BillDetails({ bill, currency, onClose, onPaid }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal bill-details-modal" role="dialog" aria-modal="true" aria-labelledby="bill-details-title" onMouseDown={(event) => event.stopPropagation()}>
    <div className="modal-head"><div><span className="eyebrow">Bill record</span><h2 id="bill-details-title">{bill.name}</h2></div><button type="button" onClick={onClose} aria-label="Close bill details">×</button></div>
    <div className="event-detail-grid"><div><small>Due date</small><b>{date(bill.dueDate)}</b></div><div><small>Amount</small><b>{formatCurrency(bill.amount, currency)}</b></div><div><small>Category</small><b>{bill.category}</b></div><div><small>Billing cycle</small><b>{bill.billingCycle.replace('_', ' ')}</b></div><div><small>Status</small><b>{bill.status}</b></div><div><small>Reminder</small><b>{bill.reminderDaysBefore || 0} days before</b></div></div>
    <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Close</button>{bill.status !== 'paid' && <button type="button" className="button button-secondary" onClick={() => onPaid(bill)}><Check size={15} /> Mark paid</button>}{bill.officialPaymentUrl && <a className="button button-primary" href={bill.officialPaymentUrl} target="_blank" rel="noreferrer">Official site <ArrowUpRight size={15} /></a>}</div>
  </section></div>;
}

function BillForm({ currency, onClose, onCreated }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true);
    try { const { data } = await api.post('/bills', { ...form, currency, amount: Number(form.amount), officialPaymentUrl: form.officialPaymentUrl || undefined }); onCreated(data); }
    catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusy(false); }
  };
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
    <div className="modal-head"><div><h2>Add bill reminder</h2><p>KayaTo never processes payments.</p></div><button type="button" onClick={onClose}>×</button></div>
    {error && <p className="form-error">{error}</p>}
    <div className="form-grid"><label className="field-label">Biller name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label className="field-label">Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{billCategories.map((category) => <option value={category} key={category}>{category}</option>)}</select></label><label className="field-label">Amount ({currency})<input type="number" min="0" step="0.01" required value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label><label className="field-label">Due date<input type="date" required value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></label></div>
    <label className="field-label">Official payment URL (optional)<input type="url" placeholder="https://" value={form.officialPaymentUrl} onChange={(event) => setForm({ ...form, officialPaymentUrl: event.target.value })} /></label>
    <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Saving...' : 'Save reminder'}</button></div>
  </form></div>;
}
