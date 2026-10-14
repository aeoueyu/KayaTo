import { ChevronRight, Pencil, Plus, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api, errorMessage } from '../lib/api';

const roleDetails = {
  owner: { label: 'Owner', description: 'Full access and member management' },
  manager: { label: 'Manager', description: 'Can edit the team and add members' },
  member: { label: 'Can edit', description: 'Can create and update team tasks' },
  viewer: { label: 'View only', description: 'Can view team work without changing it' },
};

const userId = (value) => String(value?._id || value?.id || value || '');
const initials = (name = 'Team member') => name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
const membershipFor = (team, id) => team.members?.find((member) => userId(member.user) === String(id));

export default function Team() {
  const { user } = useAuth();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [createForm, setCreateForm] = useState({ name: '', description: '' });
  const [invite, setInvite] = useState({ team: '', identifier: '', role: 'member' });
  const [busy, setBusy] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/teams');
      setTeams(data);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const manageableTeams = useMemo(
    () => teams.filter((team) => ['owner', 'manager'].includes(membershipFor(team, user?.id)?.role)),
    [teams, user?.id],
  );

  const selectedInviteTeam = manageableTeams.find((team) => team._id === invite.team);
  const canInviteManager = membershipFor(selectedInviteTeam || {}, user?.id)?.role === 'owner';

  const replaceTeam = (updatedTeam) => {
    setTeams((current) => current.map((team) => team._id === updatedTeam._id ? updatedTeam : team));
    setSelectedTeam((current) => current?._id === updatedTeam._id ? updatedTeam : current);
  };

  const create = async (event) => {
    event.preventDefault();
    const name = createForm.name.trim();
    const description = createForm.description.trim();
    if (name.length < 2 || name.length > 100) {
      setError('Team name must be 2 to 100 characters.');
      return;
    }
    if (description.length > 500) {
      setError('Team description must be 500 characters or fewer.');
      return;
    }
    setBusy(true); setError(''); setMessage('');
    try {
      const { data } = await api.post('/teams', { name, description });
      setTeams((current) => [data, ...current]);
      setCreateForm({ name: '', description: '' });
      window.dispatchEvent(new Event('kayato:teams-changed'));
      setMessage('Team created.');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const add = async (event) => {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      const { data } = await api.post(`/teams/${invite.team}/members`, {
        identifier: invite.identifier.trim(),
        role: invite.role,
      });
      replaceTeam(data);
      setInvite({ team: '', identifier: '', role: 'member' });
      window.dispatchEvent(new Event('kayato:teams-changed'));
      setMessage('Member added to the team.');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page-block">
      <div className="page-heading">
        <div><h1>Team</h1><p>Select a team to review members, access levels, and workspace information.</p></div>
      </div>

      {error && <p className="form-error page-notice" role="alert">{error}</p>}
      {message && <p className="team-success page-notice" role="status">{message}</p>}

      <div className="settings-grid">
        <form className="panel compact-form" onSubmit={create}>
          <div className="panel-heading"><div><h2>Create a team</h2><span>Starts with a general chat channel</span></div><Plus size={19} /></div>
          <label className="field-label">Team name<input value={createForm.name} onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })} minLength="2" maxLength="100" required /></label>
          <label className="field-label">Description <small>Optional</small><textarea rows="3" value={createForm.description} onChange={(event) => setCreateForm({ ...createForm, description: event.target.value })} maxLength="500" /></label>
          <button className="button button-primary" disabled={busy}>Create team</button>
        </form>

        <form className="panel compact-form" onSubmit={add}>
          <div className="panel-heading"><div><h2>Add a member</h2><span>Owners and managers can invite</span></div><UserPlus size={19} /></div>
          <label className="field-label">Team<select required value={invite.team} onChange={(event) => setInvite({ ...invite, team: event.target.value, role: 'member' })}><option value="">Select team</option>{manageableTeams.map((team) => <option value={team._id} key={team._id}>{team.name}</option>)}</select></label>
          <label className="field-label">Username or email<input required value={invite.identifier} onChange={(event) => setInvite({ ...invite, identifier: event.target.value })} placeholder="@username or name@example.com" autoComplete="off" /></label>
          <label className="field-label">Access<select value={invite.role} onChange={(event) => setInvite({ ...invite, role: event.target.value })}><option value="member">Can edit</option><option value="viewer">View only</option>{canInviteManager && <option value="manager">Manager</option>}</select></label>
          <button className="button button-secondary" disabled={busy || manageableTeams.length === 0}>Add member</button>
        </form>
      </div>

      {loading ? (
        <div className="app-loading"><span className="loading-spinner" />Loading teams...</div>
      ) : (
        <div className="team-grid">
          {teams.map((team) => {
            const myRole = membershipFor(team, user?.id)?.role || 'viewer';
            return (
              <article className="panel team-card" key={team._id}>
                <div className="team-card-top"><span className="team-icon"><Users size={20} /></span><span className={`team-role-badge ${myRole}`}>{roleDetails[myRole]?.label}</span></div>
                <h2>{team.name}</h2>
                <p>{team.description || 'Shared KayaTo workspace'}</p>
                <div className="team-card-summary"><span>{team.members?.length || 0} member{team.members?.length === 1 ? '' : 's'}</span><span>{roleDetails[myRole]?.description}</span></div>
                <button type="button" className="team-select-action" onClick={() => setSelectedTeam(team)}>Select team <ChevronRight size={16} /></button>
              </article>
            );
          })}
          {!teams.length && <div className="panel empty-state"><Users size={30} /><h2>No team yet</h2><p>Create one to unlock shared tasks and chat.</p></div>}
        </div>
      )}

      {selectedTeam && <TeamManager team={selectedTeam} currentUserId={user?.id} onClose={() => setSelectedTeam(null)} onUpdated={replaceTeam} />}
    </section>
  );
}

function TeamManager({ team, currentUserId, onClose, onUpdated }) {
  const myRole = membershipFor(team, currentUserId)?.role;
  const isOwner = myRole === 'owner';
  const canEditTeam = isOwner || myRole === 'manager';
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: team.name || '', description: team.description || '' });
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberRole, setMemberRole] = useState('member');
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setForm({ name: team.name || '', description: team.description || '' });
  }, [team]);

  const chooseMember = (member) => {
    if (!isOwner || member.role === 'owner') return;
    setSelectedMember(member);
    setMemberRole(member.role);
    setConfirmation(null);
    setError('');
    setMessage('');
  };

  const saveTeam = async (event) => {
    event.preventDefault();
    const name = form.name.trim();
    const description = form.description.trim();
    if (name.length < 2 || name.length > 100) { setError('Team name must be 2 to 100 characters.'); return; }
    if (description.length > 500) { setError('Team description must be 500 characters or fewer.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const { data } = await api.patch(`/teams/${team._id}`, { name, description });
      onUpdated(data);
      setEditing(false);
      setMessage('Team information saved.');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const confirmMemberAction = async () => {
    if (!selectedMember || !confirmation) return;
    const selectedId = userId(selectedMember.user);
    setBusy(true); setError(''); setMessage('');
    try {
      const response = confirmation.type === 'remove'
        ? await api.delete(`/teams/${team._id}/members/${selectedId}`)
        : await api.patch(`/teams/${team._id}/members/${selectedId}`, { role: confirmation.role });
      onUpdated(response.data);
      if (confirmation.type === 'remove') {
        setSelectedMember(null);
        setMessage('Member removed from the team.');
      } else {
        const updatedMember = response.data.members.find((member) => userId(member.user) === selectedId);
        setSelectedMember(updatedMember || null);
        setMemberRole(updatedMember?.role || confirmation.role);
        setMessage('Member access updated.');
      }
      setConfirmation(null);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="modal team-manager-modal" role="dialog" aria-modal="true" aria-labelledby="team-manager-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head team-manager-head">
          <div><span className={`team-role-badge ${myRole}`}>{roleDetails[myRole]?.label}</span><h2 id="team-manager-title">{team.name}</h2><p>{roleDetails[myRole]?.description}</p></div>
          <button type="button" onClick={onClose} aria-label="Close team">×</button>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="team-success" role="status">{message}</p>}

        {editing ? (
          <form className="team-edit-form" onSubmit={saveTeam} noValidate>
            <label className="field-label">Team name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} minLength="2" maxLength="100" autoFocus required /></label>
            <label className="field-label">Description<textarea rows="5" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength="500" /></label>
            <div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => { setEditing(false); setForm({ name: team.name || '', description: team.description || '' }); }} disabled={busy}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Saving...' : 'Save team'}</button></div>
          </form>
        ) : (
          <>
            <div className="team-overview">
              <div><small>Description</small><p>{team.description || 'No description provided.'}</p></div>
              <div><small>Members</small><strong>{team.members?.length || 0}</strong></div>
              {canEditTeam && <button type="button" className="button button-secondary button-small" onClick={() => { setEditing(true); setError(''); setMessage(''); }}><Pencil size={15} />Update team</button>}
            </div>

            <section className="team-members-section">
              <div className="team-section-heading"><div><h3>Team members</h3><p>{isOwner ? 'Select a member to review permitted actions.' : 'Member access is managed by the team owner.'}</p></div><ShieldCheck size={19} /></div>
              <div className="team-member-list">
                {team.members?.map((member) => {
                  const memberId = userId(member.user);
                  const selectable = isOwner && member.role !== 'owner';
                  const active = userId(selectedMember?.user) === memberId;
                  return (
                    <button type="button" className={`team-member-row${active ? ' selected' : ''}`} key={memberId} onClick={() => chooseMember(member)} disabled={!selectable}>
                      <span className="avatar avatar-plum">{initials(member.user?.displayName)}</span>
                      <span className="team-member-identity"><b>{member.user?.displayName || 'Team member'}{memberId === String(currentUserId) && <em>You</em>}</b><small>{member.user?.email}</small></span>
                      <span className={`team-access-pill ${member.role}`}>{roleDetails[member.role]?.label || member.role}</span>
                      {selectable && <ChevronRight size={16} />}
                    </button>
                  );
                })}
              </div>
            </section>

            {selectedMember && isOwner && (
              <section className="member-actions-panel">
                <div><h3>{selectedMember.user?.displayName}</h3><p>Choose the access this member should have.</p></div>
                <label className="field-label">Member access<select value={memberRole} onChange={(event) => { setMemberRole(event.target.value); setConfirmation(null); }}><option value="manager">Manager: manage team</option><option value="member">Can edit: update team tasks</option><option value="viewer">View only: no task changes</option></select><small>{roleDetails[memberRole]?.description}</small></label>
                {!confirmation ? (
                  <div className="member-action-buttons">
                    <button type="button" className="button button-primary" disabled={memberRole === selectedMember.role} onClick={() => setConfirmation({ type: 'role', role: memberRole })}>Review role change</button>
                    <button type="button" className="button button-danger" onClick={() => setConfirmation({ type: 'remove' })}><Trash2 size={15} />Remove member</button>
                  </div>
                ) : (
                  <div className="team-confirmation" role="alertdialog" aria-label="Confirm member change">
                    <b>{confirmation.type === 'remove' ? `Remove ${selectedMember.user?.displayName}?` : `Change access to ${roleDetails[confirmation.role]?.label}?`}</b>
                    <p>{confirmation.type === 'remove' ? 'They will lose access to this team, its tasks, and team conversations.' : `This member will have ${roleDetails[confirmation.role]?.description.toLowerCase()}.`}</p>
                    <div><button type="button" className="button button-secondary" onClick={() => setConfirmation(null)} disabled={busy}>Cancel</button><button type="button" className={confirmation.type === 'remove' ? 'button button-danger' : 'button button-primary'} onClick={confirmMemberAction} disabled={busy}>{busy ? 'Saving...' : 'Confirm change'}</button></div>
                  </div>
                )}
              </section>
            )}

            <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Close</button></div>
          </>
        )}
      </section>
    </div>
  );
}
