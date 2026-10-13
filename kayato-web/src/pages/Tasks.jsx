
import { Plus, Search, Trash2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage, formatDateInput } from '../lib/api';

const columns = [
  ['todo', 'To do'],
  ['in-progress', 'In progress'],
  ['review', 'For review'],
  ['done', 'Completed'],
];

const emptyForm = {
  title: '',
  description: '',
  project: 'Personal',
  taskType: 'personal',
  team: '',
  status: 'todo',
  priority: 'medium',
  dueDate: '',
};

// Supports array and paginated API responses.
function extractList(response, key) {
  if (Array.isArray(response)) return response;

  if (Array.isArray(response?.items)) {
    return response.items;
  }

  if (Array.isArray(response?.[key])) {
    return response[key];
  }

  if (Array.isArray(response?.data)) {
    return response.data;
  }

  if (Array.isArray(response?.data?.items)) {
    return response.data.items;
  }

  if (Array.isArray(response?.data?.[key])) {
    return response.data[key];
  }

  return [];
}

function extractTask(response) {
  if (response?.task) return response.task;
  if (response?.data?.task) return response.data.task;
  if (response?.data?._id) return response.data;
  return response;
}

function dueLabel(value) {
  if (!value) return 'No due date';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'No due date';
  }

  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function getDeadlineStatus(task) {
  if (!task.dueDate || task.status === 'done') {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDate = new Date(task.dueDate);
  dueDate.setHours(0, 0, 0, 0);

  if (Number.isNaN(dueDate.getTime())) {
    return null;
  }

  const daysLeft = Math.round(
    (dueDate.getTime() - today.getTime()) /
      (1000 * 60 * 60 * 24)
  );

  if (daysLeft < 0) {
    return {
      label: 'Overdue',
      type: 'overdue',
    };
  }

  if (daysLeft === 0) {
    return {
      label: 'Due today',
      type: 'today',
    };
  }

  if (daysLeft <= 3) {
    return {
      label: `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`,
      type: 'upcoming',
    };
  }

  return null;
}


export default function Tasks() {
  const [items, setItems] = useState([]);
  const [teams, setTeams] = useState([]);
  const [scope, setScope] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');

    try {
      // Fetch tasks and teams separately so a missing
      // Teams API will not break Personal Tasks.
      const tasksResponse = await api.get('/tasks', {
        params: { limit: 50 },
      });

      const taskList = extractList(tasksResponse.data, 'tasks');
      setItems(taskList);

      try {
        const teamsResponse = await api.get('/teams');
        const teamList = extractList(teamsResponse.data, 'teams');
        setTeams(teamList);
      } catch (teamError) {
        console.warn('Could not load teams:', teamError);
        setTeams([]);
      }
    } catch (requestError) {
      setItems([]);
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const tasks = useMemo(() => {
    return items.filter((task) => {
      const matchesScope =
        scope === 'all' || task.taskType === scope;

      const searchText =
        `${task.title || ''} ${task.project || ''}`.toLowerCase();

      return (
        matchesScope &&
        searchText.includes(query.toLowerCase())
      );
    });
  }, [items, scope, query]);

  const updateStatus = async (task, status) => {
    setError('');

    try {
      const response = await api.patch(
        `/tasks/${task._id}`,
        {
          status,
          progress:
            status === 'done'
              ? 100
              : task.progress || 0,
        }
      );

      const updatedTask = extractTask(response.data);

      if (updatedTask?._id) {
        setItems((current) =>
          current.map((item) =>
            item._id === updatedTask._id
              ? updatedTask
              : item
          )
        );
      } else {
        await load();
      }
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  const remove = async () => {
    if (!pendingDelete) return;

    setError('');

    try {
      await api.delete(`/tasks/${pendingDelete._id}`);

      setItems((current) =>
        current.filter(
          (task) => task._id !== pendingDelete._id
        )
      );

      setPendingDelete(null);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  return (
    <section className="page-block">
      <div className="page-heading">
        <div>
          <h1>Tasks</h1>
          <p>
            Manage personal priorities and team delivery
            in one place.
          </p>
        </div>

        <button
          className="button button-primary"
          onClick={() => setShowCreate(true)}
        >
          <Plus size={17} />
          Create task
        </button>
      </div>

      {error && (
        <p
          className="form-error page-notice"
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="task-toolbar">
        <div className="segmented">
          {['all', 'personal', 'team'].map((item) => (
            <button
              key={item}
              className={
                scope === item ? 'active' : ''
              }
              onClick={() => setScope(item)}
            >
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>

        <label className="table-search">
          <Search size={16} />

          <input
            value={query}
            onChange={(e) =>
              setQuery(e.target.value)
            }
            placeholder="Search tasks"
          />
        </label>
      </div>

      {loading ? (
        <div className="app-loading">
          <span className="loading-spinner" />
          Loading tasks...
        </div>
      ) : (
        <div className="kanban-board">
          {columns.map(([id, label]) => {
            const columnTasks = tasks.filter(
              (task) => task.status === id
            );

            return (
              <section
                className="kanban-column"
                key={id}
              >
                <div className="kanban-heading">
                  <div>
                    <span
                      className={`column-dot ${id}`}
                    />
                    <b>{label}</b>
                    <small>
                      {columnTasks.length}
                    </small>
                  </div>

                  <button
                    aria-label={`Add to ${label}`}
                    onClick={() =>
                      setShowCreate(true)
                    }
                  >
                    <Plus size={16} />
                  </button>
                </div>

                <div className="kanban-cards">
                  
               {columnTasks.map((task) => {
                const deadline = getDeadlineStatus(task);

                return (
                <article
                className="kanban-card"
                key={task._id}
                >

                      <div className="card-top">
                        <span
                          className={`task-kind ${task.taskType}`}
                        >
                          {task.taskType === 'team' && (
                            <Users size={12} />
                          )}
                          {' '}
                          {task.taskType}
                        </span>

                        <button
                          className="card-delete-action"
                          onClick={() =>
                            setPendingDelete(task)
                          }
                          aria-label={`Delete ${task.title}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>

                      <h3>{task.title}</h3>
                      <p>{task.project}</p>

                      <div className="card-progress">
                        <div>
                          <span>
                            <i
                              style={{
                                width: `${
                                  task.progress || 0
                                }%`,
                              }}
                            />
                          </span>

                          <small>
                            {task.progress || 0}%
                          </small>
                        </div>
                      </div>

                      <div className="card-footer">
                        <span
                          className={`priority-label ${task.priority}`}
                        >
                          {task.priority}
                        </span>

                        
                 {deadline && (
                 <span className={`card-due deadline-${deadline.type}`}>
                 {deadline.label}
                 </span>
                 )}

                      </div>

                      <label className="compact-select">
                        Move task

                        <select
                          value={task.status}
                          onChange={(e) =>
                            updateStatus(
                              task,
                              e.target.value
                            )
                          }
                        >
                          {columns.map(
                            ([value, text]) => (
                              <option
                                value={value}
                                key={value}
                              >
                                {text}
                              </option>
                            )
                          )}
                        </select>
                      </label>
                    </article>
                     );
                  })}

                  {!columnTasks.length && (
                    <div className="column-empty">
                      <b>No tasks here</b>
                      <span>
                        Create a task or move one
                        into this stage.
                      </span>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateTask
          teams={teams}
          onClose={() =>
            setShowCreate(false)
          }
          onCreated={async () => {
            setShowCreate(false);
            await load();
          }}
        />
      )}

      {pendingDelete && (
        <div
          className="modal-backdrop"
          onMouseDown={() =>
            setPendingDelete(null)
          }
        >
          <div
            className="modal delete-modal"
            onMouseDown={(e) =>
              e.stopPropagation()
            }
          >
            <span className="danger-icon">
              !
            </span>

            <h2>
              Delete “{pendingDelete.title}”?
            </h2>

            <p>This cannot be undone.</p>

            <div className="modal-actions">
              <button
                className="button button-secondary"
                onClick={() =>
                  setPendingDelete(null)
                }
              >
                Keep task
              </button>

              <button
                className="button button-danger"
                onClick={remove}
              >
                Delete task
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function CreateTask({
  teams,
  onClose,
  onCreated,
}) {
  const [form, setForm] = useState({
    ...emptyForm,
  });

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();

    if (
      form.taskType === 'team' &&
      !form.team
    ) {
      setError(
        'Please select a team before creating a team task.'
      );
      return;
    }

    setBusy(true);
    setError('');

    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        project: form.project.trim(),
        taskType: form.taskType,
        status: form.status,
        priority: form.priority,
      };

      if (form.dueDate) {
        payload.dueDate = form.dueDate;
      }

      if (form.taskType === 'team') {
        payload.team = form.team;
      }

      await api.post('/tasks', payload);
      await onCreated();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={onClose}
    >
      <form
        className="modal"
        onSubmit={submit}
        onMouseDown={(e) =>
          e.stopPropagation()
        }
      >
        <div className="modal-head">
          <div>
            <h2>Create a task</h2>
            <p>
              Add only the details your team needs.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {error && (
          <p
            className="form-error"
            role="alert"
          >
            {error}
          </p>
        )}

        <label className="field-label">
          Task title

          <input
            value={form.title}
            onChange={(e) =>
              setForm({
                ...form,
                title: e.target.value,
              })
            }
            autoFocus
            required
          />
        </label>

        <div className="form-grid">
          <label className="field-label">
            Task type

            <select
              value={form.taskType}
              onChange={(e) =>
                setForm({
                  ...form,
                  taskType: e.target.value,
                  team: '',
                })
              }
            >
              <option value="personal">
                Personal
              </option>

              <option value="team">
                Team
              </option>
            </select>
          </label>

          <label className="field-label">
            Priority

            <select
              value={form.priority}
              onChange={(e) =>
                setForm({
                  ...form,
                  priority: e.target.value,
                })
              }
            >
              <option value="low">
                Low
              </option>

              <option value="medium">
                Medium
              </option>

              <option value="high">
                High
              </option>

              <option value="urgent">
                Urgent
              </option>
            </select>
          </label>
        </div>

        {form.taskType === 'team' && (
          <label className="field-label">
            Team

            <select
              value={form.team}
              onChange={(e) =>
                setForm({
                  ...form,
                  team: e.target.value,
                })
              }
              required
            >
              <option value="">
                Select a team
              </option>

              {teams.map((team) => (
                <option
                  key={team._id || team.id}
                  value={team._id || team.id}
                >
                  {team.name}
                </option>
              ))}
            </select>

            {teams.length === 0 && (
              <small>
                No teams available.
                Create or join a team first,
                or choose Personal.
              </small>
            )}
          </label>
        )}

        <div className="form-grid">
          <label className="field-label">
            Project

            <input
              value={form.project}
              onChange={(e) =>
                setForm({
                  ...form,
                  project: e.target.value,
                })
              }
            />
          </label>

          <label className="field-label">
            Due date

            <input
              type="date"
              value={formatDateInput(
                form.dueDate
              )}
              onChange={(e) =>
                setForm({
                  ...form,
                  dueDate: e.target.value,
                })
              }
            />
          </label>
        </div>

        <label className="field-label">
          Description

          <textarea
            rows="4"
            value={form.description}
            onChange={(e) =>
              setForm({
                ...form,
                description: e.target.value,
              })
            }
          />
        </label>

        <div className="modal-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            className="button button-primary"
            disabled={busy}
          >
            {busy
              ? 'Creating...'
              : 'Create task'}
          </button>
        </div>
      </form>
    </div>
  );
}
