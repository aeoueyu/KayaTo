import {
  Check, ChevronLeft, ChevronRight, Hash, MessageCircle, Search, Send, Sparkles, UserPlus, Users, X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../auth/AuthContext';
import KayaMascot from '../components/KayaMascot';
import { api, errorMessage, SOCKET_URL } from '../lib/api';

const emptyFriends = { friends: [], incoming: [], outgoing: [] };
const personId = (person) => String(person?._id || person?.id || '');
const initials = (name = 'KayaTo User') => name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
const personHandle = (person) => person?.username ? `@${person.username}` : person?.email || '';

export default function Chat() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [friends, setFriends] = useState(emptyFriends);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(() => window.innerWidth > 820);
  const [friendPanel, setFriendPanel] = useState(false);
  const [friendQuery, setFriendQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [friendAction, setFriendAction] = useState('');

  const directConversations = useMemo(() => conversations.filter((item) => item.kind === 'direct'), [conversations]);
  const teamConversations = useMemo(() => conversations.filter((item) => item.kind !== 'direct'), [conversations]);
  const otherParticipant = (conversation) => conversation?.participants?.find((person) => personId(person) !== String(user?.id));
  const activePerson = active?.kind === 'direct' ? otherParticipant(active) : null;

  const refreshWorkspace = async ({ preserveActive = true } = {}) => {
    const [{ data: conversationData }, { data: friendData }] = await Promise.all([
      api.get('/conversations'), api.get('/friends'),
    ]);
    setConversations(conversationData);
    setFriends(friendData);
    setActive((current) => {
      if (preserveActive && current) return conversationData.find((item) => item._id === current._id) || current;
      return conversationData[0] || null;
    });
    return { conversationData, friendData };
  };

  useEffect(() => {
    refreshWorkspace({ preserveActive: false })
      .catch((requestError) => setError(errorMessage(requestError)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!active) { setMessages([]); return undefined; }
    setError(''); setMessages([]); setMessagesLoading(true);
    api.get(`/conversations/${active._id}/messages`).then(({ data }) => setMessages(data)).catch((requestError) => setError(errorMessage(requestError))).finally(() => setMessagesLoading(false));
    const token = window.localStorage.getItem('kayato-token') || window.sessionStorage.getItem('kayato-token');
    const socket = io(SOCKET_URL, { auth: { token } });
    socket.emit('conversation:join', active._id);
    socket.on('message:new', (message) => setMessages((current) => current.some((item) => item._id === message._id) ? current : [...current, message]));
    return () => socket.disconnect();
  }, [active?._id]);

  const chooseConversation = (conversation) => {
    setActive(conversation);
    setNotice('');
    if (window.innerWidth <= 820) setOpen(false);
  };

  const send = async () => {
    if (!text.trim() || !active || sending) return;
    const content = text.trim();
    setText(''); setSending(true); setError('');
    try {
      const { data } = await api.post(`/conversations/${active._id}/messages`, { content });
      setMessages((current) => {
        const next = [data.message, data.aiMessage].filter(Boolean);
        return [...current, ...next.filter((item) => !current.some((existing) => existing._id === item._id))];
      });
    } catch (requestError) { setError(errorMessage(requestError)); setText(content); }
    finally { setSending(false); }
  };

  const searchPeople = async (event) => {
    event.preventDefault();
    if (friendQuery.trim().length < 2) { setError('Enter at least 2 characters to search.'); return; }
    setSearching(true); setError(''); setNotice('');
    try { const { data } = await api.get('/users/search', { params: { q: friendQuery.trim() } }); setSearchResults(data); }
    catch (requestError) { setError(errorMessage(requestError)); }
    finally { setSearching(false); }
  };

  const sendFriendRequest = async (person) => {
    setFriendAction(person.id); setError('');
    try {
      await api.post('/friends/requests', { recipientId: person.id });
      setSearchResults((current) => current.map((item) => item.id === person.id ? { ...item, relationshipStatus: 'outgoing' } : item));
      await refreshWorkspace(); setNotice(`Friend request sent to ${person.displayName}.`);
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setFriendAction(''); }
  };

  const acceptRequest = async (requestId) => {
    setFriendAction(requestId); setError('');
    try {
      const { data } = await api.patch(`/friends/requests/${requestId}`, { action: 'accept' });
      await refreshWorkspace(); chooseConversation(data.conversation); setFriendPanel(false); setNotice('Friend request accepted. You can now chat privately.');
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setFriendAction(''); }
  };

  const declineRequest = async (requestId) => {
    setFriendAction(requestId); setError('');
    try { await api.delete(`/friends/requests/${requestId}`); await refreshWorkspace(); setNotice('Friend request removed.'); }
    catch (requestError) { setError(errorMessage(requestError)); }
    finally { setFriendAction(''); }
  };

  const startDirectMessage = async (person) => {
    setFriendAction(person.id); setError('');
    try {
      const existing = directConversations.find((conversation) => personId(otherParticipant(conversation)) === person.id);
      const conversation = existing || (await api.post(`/friends/${person.id}/conversation`)).data;
      setConversations((current) => current.some((item) => item._id === conversation._id) ? current : [conversation, ...current]);
      chooseConversation(conversation); setFriendPanel(false);
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setFriendAction(''); }
  };

  const resultAction = (person) => {
    if (person.relationshipStatus === 'friends') return <button className="friend-action" onClick={() => startDirectMessage(person)}>Message</button>;
    if (person.relationshipStatus === 'incoming') return <button className="friend-action" onClick={() => acceptRequest(person.requestId)}>Accept</button>;
    if (person.relationshipStatus === 'outgoing') return <button className="friend-action" disabled>Sent</button>;
    return <button className="friend-action" disabled={friendAction === person.id} onClick={() => sendFriendRequest(person)}>{friendAction === person.id ? 'Sending' : 'Add'}</button>;
  };

  const activeTitle = active?.kind === 'direct' ? activePerson?.displayName : active?.name;
  const activeSubtitle = active?.kind === 'direct' ? personHandle(activePerson) : active?.team?.name;

  return (
    <section className={`chat-page ${open ? 'channels-open' : 'channels-collapsed'}`}>
      <aside className="channel-list" aria-label="Chat navigation">
        <div className="channel-list-head">
          <b>Messages</b>
          <div className="channel-head-actions">
            <button className={`icon-button ${friendPanel ? 'active' : ''}`} onClick={() => setFriendPanel((current) => !current)} aria-label={friendPanel ? 'Close friend manager' : 'Add a friend'} aria-expanded={friendPanel} title="Add a friend"><UserPlus size={16} /></button>
            <button className="icon-button channel-list-collapse" onClick={() => setOpen(false)} aria-label="Collapse chat sidebar"><ChevronLeft size={16} /></button>
          </div>
        </div>

        {friendPanel && <div className="friend-manager">
          <div className="friend-manager-title"><div><b>Add a friend</b><small>Search by username, name, or email</small></div><button className="icon-button" onClick={() => setFriendPanel(false)} aria-label="Close friend manager"><X size={15} /></button></div>
          <form className="friend-search" onSubmit={searchPeople}>
            <label htmlFor="friend-search">Find people</label>
            <div><Search size={15} /><input id="friend-search" value={friendQuery} onChange={(event) => setFriendQuery(event.target.value)} placeholder="@username, name, or email" autoComplete="off" spellCheck="false" /><button type="submit" disabled={searching || friendQuery.trim().length < 2}>{searching ? 'Searching' : 'Search'}</button></div>
          </form>
          {friends.incoming.length > 0 && <div className="friend-request-list"><b>Requests</b>{friends.incoming.map(({ requestId, user: person }) => <div className="friend-row" key={requestId}><span className="avatar avatar-plum">{initials(person.displayName)}</span><span><b>{person.displayName}</b><small>{personHandle(person)}</small></span><div><button className="mini-icon accept" disabled={friendAction === requestId} onClick={() => acceptRequest(requestId)} aria-label={`Accept ${person.displayName}'s friend request`}><Check size={15} /></button><button className="mini-icon" disabled={friendAction === requestId} onClick={() => declineRequest(requestId)} aria-label={`Decline ${person.displayName}'s friend request`}><X size={15} /></button></div></div>)}</div>}
          <div className="friend-results" aria-live="polite">
            {searchResults.map((person) => <div className="friend-row" key={person.id}><span className="avatar avatar-violet">{initials(person.displayName)}</span><span><b>{person.displayName}</b><small>{personHandle(person)}</small></span>{resultAction(person)}</div>)}
            {!searching && friendQuery && searchResults.length === 0 && <p className="friend-empty">Search to find another KayaTo user.</p>}
          </div>
        </div>}

        {!friendPanel && <>
          <div className="channel-section"><div><b>Friends</b><span>{friends.friends.length}</span></div>{friends.friends.map(({ user: person }) => {
            const selected = active?.kind === 'direct' && personId(activePerson) === person.id;
            return <button className={`channel ${selected ? 'active' : ''}`} key={person.id} onClick={() => startDirectMessage(person)} disabled={friendAction === person.id}><span className="avatar avatar-violet">{initials(person.displayName)}</span><span><b>{person.displayName}</b><small>{personHandle(person)}</small></span></button>;
          })}{friends.friends.length === 0 && <button className="friend-empty-action" onClick={() => setFriendPanel(true)}><UserPlus size={16} /><span>Add your first friend</span></button>}</div>
          <div className="channel-section"><div><b>Teams</b><span>{teamConversations.length}</span></div>{teamConversations.map((item) => <button className={`channel ${active?._id === item._id ? 'active' : ''}`} key={item._id} onClick={() => chooseConversation(item)}><Hash size={16} /><span><b>{item.name}</b><small>{item.team?.name}</small></span></button>)}</div>
        </>}
      </aside>

      {open && <button className="channel-scrim" onClick={() => setOpen(false)} aria-label="Close chat sidebar" />}
      <main className="conversation">
        <header className="conversation-head"><div className="conversation-heading-wrap"><button className="icon-button channel-toggle" onClick={() => setOpen(!open)} aria-label={open ? 'Collapse chat sidebar' : 'Open chat sidebar'} aria-expanded={open}>{open ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}</button><div className="conversation-heading"><span className="channel-title">{active?.kind === 'direct' ? <MessageCircle size={19} /> : <Hash size={19} />}<b>{activeTitle || 'Chat'}</b></span><small>{activeSubtitle || 'Add a friend or create a team to start chatting.'}</small></div></div></header>
        {error && <p className="form-error page-notice" role="alert">{error}</p>}
        {notice && <p className="form-message page-notice" role="status">{notice}</p>}
        <div className="message-list">
          {(loading || messagesLoading) && <div className="chat-loading" role="status"><span className="loading-spinner" />{loading ? 'Loading conversations...' : 'Loading messages...'}</div>}
          {!loading && !messagesLoading && messages.map((message) => <article className={`message ${message.senderType === 'ai' ? 'ai-message' : ''}`} key={message._id}><span className={`avatar ${message.senderType === 'ai' ? 'kaya-avatar' : 'avatar-plum'}`}>{message.senderType === 'ai' ? <KayaMascot size={28} decorative /> : initials(message.sender?.displayName || message.senderName)}</span><div className="message-body"><div className="message-meta"><b>{message.senderType === 'ai' ? 'Kaya' : message.sender?.displayName || message.senderName}</b>{message.senderType === 'ai' && <span>Assistant</span>}<small>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></div><p>{message.content}</p></div></article>)}
          {!loading && !messagesLoading && active && !messages.length && <div className="empty-state"><MessageCircle size={28} /><h3>Start the conversation</h3><p>{active.kind === 'direct' ? `Say hello to ${activePerson?.displayName || 'your friend'}.` : 'Send an update, or mention @Kaya for task-aware guidance.'}</p></div>}
          {!loading && !messagesLoading && !active && <div className="empty-state"><Users size={28} /><h3>Your messages will appear here</h3><p>Add a friend for private chat, or create a team conversation.</p><button className="friend-action" onClick={() => { setOpen(true); setFriendPanel(true); }}>Add a friend</button></div>}
        </div>
        <div className="composer"><div className="mention-hint"><Sparkles size={14} /> Mention <b>@Kaya</b> for a summary or priority suggestion.</div><div className="composer-box"><textarea value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }} disabled={!active || sending} aria-label="Message" placeholder={active ? `Message ${activeTitle}` : 'Choose a conversation to start chatting'} rows="1" /><button className="send-button" onClick={send} disabled={!active || !text.trim() || sending} aria-label="Send message"><Send size={17} /></button></div></div>
      </main>
    </section>
  );
}
