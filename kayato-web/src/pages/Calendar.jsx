
import { CalendarDays, CreditCard, ListTodo } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../lib/api';

function extractItems(data, key) {
  if (Array.isArray(data)) return data;

  if (Array.isArray(data?.[key])) {
    return data[key];
  }

  if (Array.isArray(data?.data)) {
    return data.data;
  }

  if (Array.isArray(data?.data?.[key])) {
    return data.data[key];
  }

  if (Array.isArray(data?.items)) {
    return data.items;
  }

  return [];
}

function validDate(value) {
  if (!value) return false;

  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

export default function Calendar() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadCalendar() {
      setLoading(true);
      setError('');

      try {
        const [tasksResponse, billsResponse] = await Promise.all([
          api.get('/tasks'),
          api.get('/bills'),
        ]);

        const tasks = extractItems(tasksResponse.data, 'tasks');
        const bills = extractItems(billsResponse.data, 'bills');

        const taskItems = tasks
          .filter((task) => validDate(task.dueDate))
          .map((task) => ({
            id: task._id || task.id,
            title: task.title,
            date: task.dueDate,
            type: 'Task',
          }));

        const billItems = bills
          .filter((bill) => validDate(bill.dueDate))
          .map((bill) => ({
            id: bill._id || bill.id,
            title: bill.name || bill.title,
            date: bill.dueDate,
            type: 'Bill',
          }));

        const calendarItems = [...taskItems, ...billItems].sort(
          (a, b) => new Date(a.date) - new Date(b.date)
        );

        if (active) {
          setItems(calendarItems);
        }
      } catch (err) {
        if (active) {
          setError(errorMessage(err));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadCalendar();

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="page-block">
      <div className="page-heading">
        <div>
          <h1>Calendar</h1>
          <p>Your task deadlines and bill reminders in one timeline.</p>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      <section className="panel timeline-panel">
        <div className="panel-heading">
          <div>
            <h2>Upcoming</h2>
            <span>{items.length} scheduled items</span>
          </div>
          <CalendarDays size={19} />
        </div>

        <div className="timeline-list">
          {items.map((item, index) => (
            <article key={`${item.type}-${item.id || index}`}>
              <time>
                {new Intl.DateTimeFormat('en-PH', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                }).format(new Date(item.date))}
              </time>

              <span className="timeline-icon">
                {item.type === 'Task' ? (
                  <ListTodo size={17} />
                ) : (
                  <CreditCard size={17} />
                )}
              </span>

              <div>
                <b>{item.title}</b>
                <small>{item.type}</small>
              </div>
            </article>
          ))}

          {!loading && !items.length && (
            <div className="empty-state">
              <CalendarDays size={30} />
              <h2>Your calendar is clear</h2>
              <p>
                Tasks and bill reminders with due dates will appear here.
              </p>
            </div>
          )}

          {loading && (
            <div className="empty-state">
              <CalendarDays size={30} />
              <h2>Loading calendar...</h2>
              <p>Fetching your tasks and bill reminders.</p>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
