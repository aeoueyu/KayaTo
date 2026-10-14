
import { ArrowRight, Pencil, Plus, Save, Search, Trash2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api, errorMessage, formatDateInput } from '../lib/api';

const columns = [
  ['todo', 'To do'],
  ['in-progress', 'In progress'],
  ['review', 'For review'],
  ['done', 'Completed'],
];
const statusTransitions = {
  todo: ['todo', 'in-progress'],
  'in-progress': ['todo', 'in-progress', 'review'],
  review: ['in-progress', 'review', 'done'],
  done: ['review', 'done'],
};

const emptyForm = {
  title: '',
  description: '',
  project: 'Personal',
  taskType: 'personal',
  team: '',
  status: 'todo',
  priority: 'medium',
  dueDate: '',
  assignees: [],
  subtasks: '',
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

function fullDateLabel(value) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
  }).format(date);
}

function dateTimeLabel(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
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
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [teams, setTeams] = useState([]);
  const [scope, setScope] = useState('all');
  const [teamFilter, setTeamFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [createStatus, setCreateStatus] = useState('todo');
  const [draggingTaskId, setDraggingTaskId] = useState('');

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
    const normalizedQuery = query.trim().toLowerCase();

    return items.filter((task) => {
      const matchesScope =
        scope === 'all' || task.taskType === scope;
      const matchesStatus =
        statusFilter === 'all' || task.status === statusFilter;
      const matchesTitle = [task.title, task.project, task.description]
        .some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
      const taskTeamId = String(task.team?._id || task.team || '');
      const matchesTeam = teamFilter === 'all'
        || (teamFilter === 'personal' && task.taskType === 'personal')
        || taskTeamId === teamFilter;

      return (
        matchesScope &&
        matchesStatus &&
        matchesTeam &&
        matchesTitle
      );
    });
  }, [items, scope, statusFilter, teamFilter, query]);

  const editableTeamIds = useMemo(() => new Set(
    teams
      .filter((team) => team.members?.some((member) => String(member.user?._id || member.user) === String(user?.id) && member.role !== 'viewer'))
      .map((team) => String(team._id)),
  ), [teams, user?.id]);

  const visibleColumns =
    statusFilter === 'all'
      ? columns
      : columns.filter(([id]) => id === statusFilter);

  const clearFilters = () => {
    setScope('all');
    setStatusFilter('all');
    setTeamFilter('all');
    setQuery('');
  };

  const selectedTeam = teams.find((team) => String(team._id) === teamFilter);
  const selectedTeamTasks = items.filter((task) => String(task.team?._id || task.team) === teamFilter);
  const projectProgress = selectedTeamTasks.length
    ? Math.round(selectedTeamTasks.reduce((sum, task) => sum + (task.progress || 0), 0) / selectedTeamTasks.length)
    : 0;

  const updateStatus = async (task, status) => {
    if (task.status === status) return;
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

  const dropTask = async (event, status) => {
    event.preventDefault();
    const taskId = event.dataTransfer.getData('text/task-id') || draggingTaskId;
    setDraggingTaskId('');
    const task = items.find((item) => item._id === taskId);
    if (task) await updateStatus(task, status);
  };

  const openTask = async (task) => {
    setSelectedTask(task);
    setDetailsLoading(true);
    setError('');

    try {
      const response = await api.get(`/tasks/${task._id}`);
      const detailedTask = extractTask(response.data);
      setSelectedTask(detailedTask);
    } catch (requestError) {
      setSelectedTask(null);
      setError(errorMessage(requestError, 'Unable to load task details.'));
      if (searchParams.get('task') === String(task._id)) {
        const next = new URLSearchParams(searchParams);
        next.delete('task');
        setSearchParams(next, { replace: true });
      }
    } finally {
      setDetailsLoading(false);
    }
  };

  const requestedTaskId = searchParams.get('task');
  const requestedTeamId = searchParams.get('team');
  const requestedProject = searchParams.get('project');

  useEffect(() => {
    if (requestedProject) setQuery(requestedProject);
  }, [requestedProject]);

  useEffect(() => {
    if (!requestedTeamId || !teams.some((team) => String(team._id) === requestedTeamId)) return;
    setScope('team');
    setTeamFilter(requestedTeamId);
  }, [requestedTeamId, teams]);

  useEffect(() => {
    if (!requestedTaskId || detailsLoading || String(selectedTask?._id || '') === requestedTaskId) return;
    const task = items.find((item) => String(item._id) === requestedTaskId);
    if (task) openTask(task);
  }, [requestedTaskId, items, selectedTask?._id, detailsLoading]);

  const closeTask = () => {
    setSelectedTask(null);
    if (requestedTaskId) {
      const next = new URLSearchParams(searchParams);
      next.delete('task');
      setSearchParams(next, { replace: true });
    }
  };

  const saveTask = (updatedTask) => {
    setItems((current) =>
      current.map((item) =>
        item._id === updatedTask._id ? updatedTask : item
      )
    );
    setSelectedTask(updatedTask);
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
          onClick={() => { setCreateStatus('todo'); setShowCreate(true); }}
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

      {selectedTeam && (
        <section className="team-project-summary" aria-label={`${selectedTeam.name} project progress`}>
          <div><span className="team-icon"><Users size={18} /></span><div><small>Team project</small><h2>{selectedTeam.name}</h2></div></div>
          <div className="project-progress"><span><i style={{ width: `${projectProgress}%` }} /></span><b>{projectProgress}%</b><small>{selectedTeamTasks.length} task{selectedTeamTasks.length === 1 ? '' : 's'}</small></div>
        </section>
      )}

      <div className="task-toolbar">
        <div className="segmented">
          {['all', 'personal', 'team'].map((item) => (
            <button
              key={item}
              className={
                scope === item ? 'active' : ''
              }
              onClick={() => {
                setScope(item);
                if (item === 'all') setTeamFilter('all');
                else if (item === 'personal') setTeamFilter('personal');
                else if (teamFilter === 'personal') setTeamFilter('all');
              }}
            >
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>

        <div className="toolbar-actions">
          <label className="task-status-filter team-project-filter">
            <span>Project</span>
            <select value={teamFilter} onChange={(event) => { const value = event.target.value; setTeamFilter(value); setScope(value === 'personal' ? 'personal' : value === 'all' ? 'all' : 'team'); }}>
              <option value="all">All work</option>
              <option value="personal">Personal</option>
              {teams.map((team) => <option key={team._id} value={team._id}>{team.name}</option>)}
            </select>
          </label>
          <label className="table-search">
            <Search size={16} />

            <input
              value={query}
              onChange={(e) =>
                setQuery(e.target.value)
              }
              placeholder="Search tasks"
              aria-label="Search tasks by title"
            />
          </label>

          <label className="task-status-filter">
            <span>Status</span>

            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value)
              }
            >
              <option value="all">All statuses</option>

              {columns.map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <div className="app-loading">
          <span className="loading-spinner" />
          Loading tasks...
        </div>
      ) : !error && items.length === 0 ? (
        <div className="empty-state task-board-empty">
          <Plus size={30} aria-hidden="true" />
          <h2>Create your first task</h2>
          <p>
            Add a personal priority or team deliverable to
            start organizing your work.
          </p>
          <button
            className="button button-primary"
            onClick={() => setShowCreate(true)}
          >
            Create task
          </button>
        </div>
      ) : items.length > 0 && tasks.length === 0 ? (
        <div
          className="empty-state task-board-empty"
          role="status"
        >
          <Search size={30} aria-hidden="true" />
          <h2>No matching tasks</h2>
          <p>
            Try another title or reset the task type and
            status filters.
          </p>
          <button
            className="button button-secondary"
            onClick={clearFilters}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div
          className={`kanban-board${
            statusFilter === 'all' ? '' : ' single-column'
          }`}
        >
          {visibleColumns.map(([id, label]) => {
            const columnTasks = tasks.filter(
              (task) => task.status === id
            );

            return (
              <section
                className={`kanban-column${draggingTaskId ? ' drag-ready' : ''}`}
                key={id}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => dropTask(event, id)}
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
                    onClick={() => { setCreateStatus(id); setShowCreate(true); }}
                  >
                    <Plus size={16} />
                  </button>
                </div>

                <div className="kanban-cards">
                  
               {columnTasks.map((task) => {
                const deadline = getDeadlineStatus(task);
                const canEditTask = task.taskType !== 'team' || editableTeamIds.has(String(task.team?._id || task.team));
                const canDeleteTask = canEditTask && String(task.creator?._id || task.creator) === String(user?.id);

                return (
                <article
                className={`kanban-card${draggingTaskId === task._id ? ' dragging' : ''}`}
                key={task._id}
                draggable={canEditTask}
                onDragStart={(event) => { event.dataTransfer.setData('text/task-id', task._id); event.dataTransfer.effectAllowed = 'move'; setDraggingTaskId(task._id); }}
                onDragEnd={() => setDraggingTaskId('')}
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

                        {canDeleteTask && <button
                          className="card-delete-action"
                          onClick={() =>
                            setPendingDelete(task)
                          }
                          aria-label={`Delete ${task.title}`}
                        >
                          <Trash2 size={15} />
                        </button>}
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
                          disabled={!canEditTask}
                          onChange={(e) =>
                            updateStatus(
                              task,
                              e.target.value
                            )
                          }
                        >
                          {columns.filter(([value]) => statusTransitions[task.status]?.includes(value)).map(
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

                      {!canEditTask && <small className="card-view-only">View-only access</small>}

                      <button
                        type="button"
                        className="card-open-action"
                        onClick={() => openTask(task)}
                      >
                        View complete details
                        <ArrowRight size={14} aria-hidden="true" />
                      </button>
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
          teams={teams.filter((team) => editableTeamIds.has(String(team._id)))}
          initialTeam={selectedTeam?._id || ''}
          initialStatus={createStatus}
          currentUserId={user?.id}
          onClose={() =>
            setShowCreate(false)
          }
          onCreated={async () => {
            setShowCreate(false);
            await load();
          }}
        />
      )}

      {selectedTask && (
        <TaskDetails
          task={selectedTask}
          loading={detailsLoading}
          canEdit={selectedTask.taskType !== 'team' || editableTeamIds.has(String(selectedTask.team?._id || selectedTask.team))}
          team={teams.find((item) => String(item._id) === String(selectedTask.team?._id || selectedTask.team))}
          onClose={closeTask}
          onSaved={saveTask}
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

function editFormFromTask(task) {
  return {
    title: task.title || '',
    description: task.description || '',
    project: task.project || '',
    status: task.status || 'todo',
    priority: task.priority || 'medium',
    progress: String(task.progress ?? 0),
    dueDate: formatDateInput(task.dueDate),
    completionCriteria: Array.isArray(task.completionCriteria)
      ? task.completionCriteria.join('\n')
      : '',
    assignees: Array.isArray(task.assignees) ? task.assignees.map((user) => String(user?._id || user)) : [],
    subtasks: Array.isArray(task.subtasks) ? task.subtasks.map((item) => ({ _id: item._id, title: item.title || '', completed: Boolean(item.completed) })) : [],
  };
}

function TaskDetails({ task, loading, canEdit, team, onClose, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => editFormFromTask(task));
  const [errors, setErrors] = useState({});
  const [requestError, setRequestError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm(editFormFromTask(task));
  }, [task]);

  const change = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
    setMessage('');
  };

  const beginEditing = () => {
    setForm(editFormFromTask(task));
    setErrors({});
    setRequestError('');
    setMessage('');
    setEditing(true);
  };

  const cancelEditing = () => {
    setForm(editFormFromTask(task));
    setErrors({});
    setRequestError('');
    setEditing(false);
  };

  const submit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    const title = form.title.trim();
    const description = form.description.trim();
    const project = form.project.trim();
    const progress = Number(form.progress);
    const criteria = form.completionCriteria
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
    const subtasks = form.subtasks.map((item) => ({ ...item, title: item.title.trim() })).filter((item) => item.title);

    if (!title) nextErrors.title = 'Enter a task title.';
    else if (title.length > 180) nextErrors.title = 'Use 180 characters or fewer.';
    if (description.length > 5000) nextErrors.description = 'Use 5,000 characters or fewer.';
    if (project.length > 120) nextErrors.project = 'Use 120 characters or fewer.';
    if (!Number.isFinite(progress) || progress < 0 || progress > 100) nextErrors.progress = 'Enter a value from 0 to 100.';
    if (criteria.length > 20) nextErrors.completionCriteria = 'Add no more than 20 criteria.';
    else if (criteria.some((item) => item.length > 300)) nextErrors.completionCriteria = 'Keep each criterion to 300 characters or fewer.';
    if (subtasks.length > 50) nextErrors.subtasks = 'Add no more than 50 subtasks.';
    else if (subtasks.some((item) => item.title.length > 300)) nextErrors.subtasks = 'Keep each subtask to 300 characters or fewer.';

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setBusy(true);
    setRequestError('');
    setMessage('');

    try {
      const response = await api.patch(`/tasks/${task._id}`, {
        title,
        description,
        project,
        status: form.status,
        priority: form.priority,
        progress: form.status === 'done' ? 100 : progress,
        dueDate: form.dueDate || null,
        completionCriteria: criteria,
        assignees: task.taskType === 'team' ? form.assignees : undefined,
        subtasks,
      });
      const updatedTask = extractTask(response.data);
      onSaved(updatedTask);
      setEditing(false);
      setMessage('Task changes saved.');
    } catch (error) {
      setRequestError(errorMessage(error, 'Unable to save task changes.'));
    } finally {
      setBusy(false);
    }
  };

  const toggleSubtask = async (subtaskId) => {
    if (!canEdit || busy) return;
    const subtasks = (task.subtasks || []).map((item) => ({
      _id: item._id,
      title: item.title,
      completed: String(item._id) === String(subtaskId) ? !item.completed : item.completed,
    }));
    setBusy(true); setRequestError(''); setMessage('');
    try {
      const response = await api.patch(`/tasks/${task._id}`, { subtasks });
      onSaved(extractTask(response.data));
      setMessage('Subtask and progress updated.');
    } catch (error) {
      setRequestError(errorMessage(error, 'Unable to update the subtask.'));
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = columns.find(([value]) => value === task.status)?.[1] || task.status;
  const teamName = typeof task.team === 'object' ? task.team?.name : '';
  const assignees = Array.isArray(task.assignees) ? task.assignees : [];
  const criteria = Array.isArray(task.completionCriteria) ? task.completionCriteria : [];
  const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal task-details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-details-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head task-details-head">
          <div>
            <span className={`task-kind ${task.taskType}`}>{task.taskType === 'team' && <Users size={12} />} {task.taskType}</span>
            <h2 id="task-details-title">{editing ? 'Edit task' : task.title}</h2>
            <p>{editing ? 'Update the fields below, then validate and save your changes.' : 'Complete task details'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close task details">×</button>
        </div>

        {loading ? (
          <div className="app-loading"><span className="loading-spinner" />Loading complete details...</div>
        ) : editing ? (
          <form className="task-edit-form" onSubmit={submit} noValidate>
            {requestError && <p className="form-error" role="alert">{requestError}</p>}

            <label className="field-label">
              Task title
              <input
                value={form.title}
                onChange={(event) => change('title', event.target.value)}
                maxLength="180"
                required
                autoFocus
                aria-invalid={Boolean(errors.title)}
              />
              {errors.title && <small className="field-error">{errors.title}</small>}
            </label>

            <div className="form-grid">
              <label className="field-label">
                Project
                <input
                  value={form.project}
                  onChange={(event) => change('project', event.target.value)}
                  maxLength="120"
                  aria-invalid={Boolean(errors.project)}
                />
                {errors.project && <small className="field-error">{errors.project}</small>}
              </label>
              <label className="field-label">
                Due date
                <input type="date" value={form.dueDate} onChange={(event) => change('dueDate', event.target.value)} />
              </label>
            </div>

            {task.taskType === 'team' && team && (
              <fieldset className="assignee-picker">
                <legend>Assignees</legend>
                <p>Assignments are limited to members of {team.name}.</p>
                <div>{team.members?.map((member) => {
                  const id = String(member.user?._id || member.user);
                  const checked = form.assignees.includes(id);
                  return <label key={id}><input type="checkbox" checked={checked} onChange={(event) => change('assignees', event.target.checked ? [...form.assignees, id] : form.assignees.filter((item) => item !== id))} /><span>{member.user?.displayName || member.user?.email || 'Team member'}<small>{member.role}</small></span></label>;
                })}</div>
              </fieldset>
            )}

            <div className="form-grid">
              <label className="field-label">
                Status
                <select value={form.status} onChange={(event) => change('status', event.target.value)}>
                  {columns.filter(([value]) => statusTransitions[task.status]?.includes(value)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="field-label">
                Priority
                <select value={form.priority} onChange={(event) => change('priority', event.target.value)}>
                  {['low', 'medium', 'high', 'urgent'].map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
                </select>
              </label>
            </div>

            <label className="field-label">
              Progress ({form.status === 'done' ? 100 : form.progress}%)
              <div className="progress-edit-row">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={form.status === 'done' ? 100 : form.progress}
                  disabled={form.status === 'done'}
                  onChange={(event) => change('progress', event.target.value)}
                />
                <input
                  className="progress-number"
                  type="number"
                  min="0"
                  max="100"
                  value={form.status === 'done' ? 100 : form.progress}
                  disabled={form.status === 'done'}
                  onChange={(event) => change('progress', event.target.value)}
                  aria-invalid={Boolean(errors.progress)}
                />
              </div>
              {errors.progress && <small className="field-error">{errors.progress}</small>}
              {form.status === 'done' && <small>Completed tasks are saved at 100% progress.</small>}
            </label>

            <label className="field-label">
              Description
              <textarea
                rows="5"
                value={form.description}
                onChange={(event) => change('description', event.target.value)}
                maxLength="5000"
                aria-invalid={Boolean(errors.description)}
              />
              {errors.description && <small className="field-error">{errors.description}</small>}
            </label>

            <fieldset className="subtask-editor">
              <legend>Subtasks</legend>
              <div>{form.subtasks.map((subtask, index) => (
                <div className="subtask-edit-row" key={subtask._id || index}>
                  <input type="checkbox" checked={subtask.completed} onChange={(event) => change('subtasks', form.subtasks.map((item, itemIndex) => itemIndex === index ? { ...item, completed: event.target.checked } : item))} aria-label={`Mark ${subtask.title || `subtask ${index + 1}`} complete`} />
                  <input value={subtask.title} maxLength="300" onChange={(event) => change('subtasks', form.subtasks.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} placeholder={`Subtask ${index + 1}`} />
                  <button type="button" className="icon-button" onClick={() => change('subtasks', form.subtasks.filter((_, itemIndex) => itemIndex !== index))} aria-label="Remove subtask"><Trash2 size={15} /></button>
                </div>
              ))}</div>
              <button type="button" className="button button-secondary button-small" onClick={() => change('subtasks', [...form.subtasks, { title: '', completed: false }])}><Plus size={14} />Add subtask</button>
              {errors.subtasks && <small className="field-error">{errors.subtasks}</small>}
            </fieldset>

            <label className="field-label">
              Completion criteria
              <textarea
                rows="4"
                value={form.completionCriteria}
                onChange={(event) => change('completionCriteria', event.target.value)}
                placeholder="Add one criterion per line"
                aria-invalid={Boolean(errors.completionCriteria)}
              />
              {errors.completionCriteria
                ? <small className="field-error">{errors.completionCriteria}</small>
                : <small>One criterion per line, up to 20.</small>}
            </label>

            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={cancelEditing} disabled={busy}>Cancel changes</button>
              <button className="button button-primary" disabled={busy}><Save size={16} />{busy ? 'Saving...' : 'Save changes'}</button>
            </div>
          </form>
        ) : (
          <div className="task-details-content">
            {requestError && <p className="form-error" role="alert">{requestError}</p>}
            {message && <p className="form-success" role="status">{message}</p>}
            <p className="task-detail-description">{task.description || 'No description provided.'}</p>

            <dl className="task-detail-grid">
              <div><dt>Project</dt><dd>{task.project || 'Not assigned'}</dd></div>
              <div><dt>Task type</dt><dd>{task.taskType === 'team' ? `Team${teamName ? ` · ${teamName}` : ''}` : 'Personal'}</dd></div>
              <div><dt>Status</dt><dd>{statusLabel}</dd></div>
              <div><dt>Priority</dt><dd className={`detail-priority ${task.priority}`}>{task.priority || 'Not set'}</dd></div>
              <div><dt>Progress</dt><dd>{task.progress ?? 0}%</dd></div>
              <div><dt>Due date</dt><dd>{fullDateLabel(task.dueDate)}</dd></div>
              <div><dt>Assignees</dt><dd>{assignees.length ? assignees.map((user) => user.displayName || user.email || 'Team member').join(', ') : 'Unassigned'}</dd></div>
              <div><dt>Created by</dt><dd>{task.creator?.displayName || task.creator?.email || 'Account owner'}</dd></div>
              <div><dt>Source</dt><dd>{task.aiGenerated ? 'AI planner' : 'Created manually'}</dd></div>
              <div><dt>Created</dt><dd>{dateTimeLabel(task.createdAt)}</dd></div>
              <div><dt>Last updated</dt><dd>{dateTimeLabel(task.updatedAt)}</dd></div>
            </dl>

            <section className="task-criteria-section task-subtasks-section">
              <h3>Subtasks <small>{subtasks.filter((item) => item.completed).length}/{subtasks.length}</small></h3>
              {subtasks.length
                ? <div className="subtask-checklist">{subtasks.map((item) => <label key={item._id}><input type="checkbox" checked={item.completed} disabled={!canEdit || busy} onChange={() => toggleSubtask(item._id)} /><span>{item.title}</span></label>)}</div>
                : <p>No subtasks added.</p>}
            </section>

            <section className="task-criteria-section">
              <h3>Completion criteria</h3>
              {criteria.length
                ? <ul>{criteria.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
                : <p>No completion criteria added.</p>}
            </section>

            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={onClose}>Close</button>
              {canEdit && <button type="button" className="button button-primary" onClick={beginEditing}><Pencil size={16} />Edit task</button>}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function CreateTask({
  teams,
  initialTeam,
  initialStatus,
  currentUserId,
  onClose,
  onCreated,
}) {
  const [form, setForm] = useState({
    ...emptyForm,
    taskType: initialTeam ? 'team' : 'personal',
    team: initialTeam,
    status: initialStatus || 'todo',
    assignees: initialTeam && currentUserId ? [String(currentUserId)] : [],
  });

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const selectedTeam = teams.find((team) => String(team._id || team.id) === String(form.team));

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
        subtasks: form.subtasks.split('\n').map((title) => title.trim()).filter(Boolean).map((title) => ({ title, completed: false })),
      };

      if (form.dueDate) {
        payload.dueDate = form.dueDate;
      }

      if (form.taskType === 'team') {
        payload.team = form.team;
        payload.assignees = form.assignees;
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
                  assignees: [],
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
                  assignees: currentUserId ? [String(currentUserId)] : [],
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

        {form.taskType === 'team' && selectedTeam && (
          <fieldset className="assignee-picker">
            <legend>Assignees</legend>
            <p>Select one or more members. They will receive a notification.</p>
            <div>{selectedTeam.members?.map((member) => {
              const id = String(member.user?._id || member.user);
              const checked = form.assignees.includes(id);
              return <label key={id}><input type="checkbox" checked={checked} onChange={(event) => setForm({ ...form, assignees: event.target.checked ? [...form.assignees, id] : form.assignees.filter((item) => item !== id) })} /><span>{member.user?.displayName || member.user?.email || 'Team member'}<small>{member.role}</small></span></label>;
            })}</div>
          </fieldset>
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
          Initial status
          <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
            {columns.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>

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

        <label className="field-label">
          Subtasks
          <textarea rows="4" value={form.subtasks} onChange={(event) => setForm({ ...form, subtasks: event.target.value })} placeholder="Add one subtask per line" />
          <small>One subtask per line. Completing subtasks automatically updates progress.</small>
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
