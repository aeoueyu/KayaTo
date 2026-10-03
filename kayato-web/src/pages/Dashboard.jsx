import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Plus,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import KayaMascot from '../components/KayaMascot';
import { initialTasks, members } from '../data/mockData';

const metrics = [
  { icon: Check, label: 'Completed', value: '12', note: '+3 this week', tone: 'success' },
  { icon: Clock3, label: 'In progress', value: '7', note: '2 due today', tone: 'info' },
  { icon: CircleAlert, label: 'Needs attention', value: '3', note: '1 overdue', tone: 'danger' },
  { icon: Users, label: 'Team capacity', value: '68%', note: 'Healthy range', tone: 'collaboration' },
];

export default function Dashboard() {
  const visibleTasks = initialTasks.slice(0, 4);

  return (
    <section className="page-block dashboard-page">
      <div className="page-heading dashboard-heading">
        <div>
          <span className="page-kicker">Monday, September 27</span>
          <h1>Good morning, Jamie.</h1>
          <p>Your team is on pace. Three items need a decision before the day ends.</p>
        </div>
        <Link to="/app/tasks" className="button button-primary">
          <Plus size={17} /> Create task
        </Link>
      </div>

      <section className="dashboard-command" aria-labelledby="weekly-focus-title">
        <div className="command-copy">
          <span className="command-label"><Sparkles size={14} /> Weekly focus</span>
          <h2 id="weekly-focus-title">Keep the KayaTo launch moving.</h2>
          <p>Design review is nearly complete. Clear today&apos;s three blockers to protect the Friday handoff.</p>
          <div className="command-progress" aria-label="Weekly progress: 74 percent">
            <div><span>Weekly progress</span><strong>74%</strong></div>
            <span className="command-track"><i /></span>
          </div>
        </div>
        <div className="command-people">
          <div>
            <span>Active today</span>
            <strong>4 teammates</strong>
          </div>
          <div className="command-avatars" aria-label="Alex, Juan, Mika, and Rina are active">
            {members.map((member) => (
              <span className={`avatar avatar-${member.tone}`} key={member.id} title={member.name}>{member.initials}</span>
            ))}
          </div>
          <Link to="/app/team">Open workspace <ArrowRight size={15} /></Link>
        </div>
      </section>

      <div className="metric-strip" aria-label="Workspace overview">
        {metrics.map((metric) => <Metric key={metric.label} {...metric} />)}
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-main-stack">
          <section className="panel today-panel">
            <div className="panel-heading">
              <div><h2>Today&apos;s focus</h2><span>4 tasks</span></div>
              <Link to="/app/tasks">View all <ChevronRight size={16} /></Link>
            </div>
            <div className="task-list">{visibleTasks.map((task) => <DashboardTask key={task.id} task={task} />)}</div>
          </section>

          <section className="panel focus-panel">
            <div className="panel-heading">
              <div><h2>Team pulse</h2><span>Current workload</span></div>
              <TrendingUp size={18} />
            </div>
            <div className="member-list">
              {members.map((member) => (
                <div className="member-row" key={member.id}>
                  <span className={`avatar avatar-${member.tone}`}>{member.initials}</span>
                  <div className="member-info">
                    <div><b>{member.name}</b><small>{member.workload}%</small></div>
                    <span className="load-track"><i style={{ width: `${member.workload}%` }} /></span>
                  </div>
                </div>
              ))}
            </div>
            <Link to="/app/team" className="inline-action">View team workload <ArrowRight size={15} /></Link>
          </section>
        </div>

        <aside className="dashboard-rail">
          <section className="assistant-banner">
            <div className="assistant-topline"><KayaMascot size={44} className="assistant-kaya-mascot" decorative /><span><Sparkles size={13} /> Kaya assistant</span></div>
            <div>
              <h2>Start with a brief.<br />Leave with a plan.</h2>
              <p>Turn a document into an editable task breakdown for your team.</p>
            </div>
            <Link to="/app/ai-planner" className="button button-light">Open AI planner <ArrowRight size={16} /></Link>
          </section>

          <section className="panel schedule-panel">
            <div className="panel-heading">
              <div><h2>Coming up</h2><span>Next 7 days</span></div>
              <CalendarDays size={18} />
            </div>
            <div className="schedule-item">
              <span><b>29</b><small>SEP</small></span>
              <div><b>Home internet bill</b><small>₱1,699 · Personal reminder</small></div>
              <i className="status-pill warning">Due soon</i>
            </div>
            <div className="schedule-item">
              <span><b>02</b><small>OCT</small></span>
              <div><b>Project presentation</b><small>School · High priority</small></div>
              <i className="status-pill neutral">Task</i>
            </div>
            <Link to="/app/calendar" className="inline-action">Open calendar <ArrowRight size={15} /></Link>
          </section>
        </aside>
      </div>
    </section>
  );
}

function Metric({ icon: Icon, label, value, note, tone }) {
  return (
    <article className={`metric-item metric-${tone}`}>
      <span className="metric-icon"><Icon size={16} /></span>
      <div><small>{label}</small><strong>{value}</strong></div>
      <p>{note}</p>
    </article>
  );
}

function DashboardTask({ task }) {
  return (
    <article className="dashboard-task">
      <button className={`task-check ${task.status === 'done' ? 'done' : ''}`} aria-label={`Complete ${task.title}`}>
        {task.status === 'done' && <Check size={13} />}
      </button>
      <div className="task-primary"><b>{task.title}</b><span>{task.project} · {task.type === 'team' ? 'Team task' : 'Personal'}</span></div>
      <span className={`priority-dot ${task.priority}`} title={`${task.priority} priority`} />
      <div className="progress-mini"><span><i style={{ width: `${task.progress}%` }} /></span><small>{task.progress}%</small></div>
      <span className="due-label">{task.due}</span>
      <div className="avatar-stack">{task.assignees.map((assignee, index) => <span className={`avatar tiny avatar-${index % 2 ? 'peach' : 'plum'}`} key={assignee}>{assignee}</span>)}</div>
    </article>
  );
}
