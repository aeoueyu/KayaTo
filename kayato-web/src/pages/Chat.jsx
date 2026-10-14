import {
  Check, ChevronLeft, ChevronRight, Hash, MessageCircle, Search, Send, Sparkles, UserPlus, Users, X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import KayaMascot from '../components/KayaMascot';
import { api, errorMessage } from '../lib/api';
import { formatDateTime } from '../lib/formatters';

const emptyFriends = { friends: [], incoming: [], outgoing: [] };
const personId = (person) => String(typeof person === 'string' ? person : person?._id || person?.id || '');
const initials = (name = 'KayaTo User') => name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
const personHandle = (person) => person?.username ? `@${person.username}` : person?.email || '';
const mentionPattern = /(@[A-Za-z0-9_]{1,24})/g;

function MessageContent({ content }) {
  return String(content || '').split(mentionPattern).map((part, index) => (
    /^@[A-Za-z0-9_]{1,24}$/.test(part)
      ? <mark className="chat-mention" key={`${part}-${index}`}>{part}</mark>
      : <span key={`${part}-${index}`}>{part}</span>
  ));
}

export default function Chat() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const handledGlobalSearch = useRef('');
  const messageListRef = useRef(null);
  const messageEndRef = useRef(null);
  const composerInputRef = useRef(null);
  const shouldAutoScroll = useRef(true);
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
  const [mentionContext, setMentionContext] = useState(null);
  const [selectedMention, setSelectedMention] = useState(0);

  const directConversations = useMemo(() => conversations.filter((item) => item.kind === 'direct'), [conversations]);
  const teamConversations = useMemo(() => conversations.filter((item) => item.kind !== 'direct'), [conversations]);
  const otherParticipant = (conversation) => conversation?.participants?.find((person) => personId(person) !== String(user?.id));
  const activePerson = active?.kind === 'direct' ? otherParticipant(active) : null;
  const mentionCandidates = useMemo(() => {
    const candidates = [{ id: 'kaya', displayName: 'Kaya', username: 'kaya', assistant: true }];
    const seen = new Set(['kaya']);
    for (const person of active?.participants || []) {
      const username = String(person?.username || '').trim().toLowerCase();
      if (!username || seen.has(username) || personId(person) === personId(user)) continue;
      seen.add(username);
      candidates.push({
        id: personId(person),
        displayName: person.displayName || username,
        username,
        profilePicture: person.profilePicture || '',
        assistant: false,
      });
    }
    return candidates;
  }, [active?.participants, user]);
  const mentionSuggestions = useMemo(() => {
    if (!mentionContext) return [];
    const query = mentionContext.query.toLowerCase();
    return mentionCandidates
      .filter((candidate) => candidate.username.includes(query) || candidate.displayName.toLowerCase().includes(query))
      .slice(0, 6);
  }, [mentionCandidates, mentionContext]);
  const mentionMenuOpen = Boolean(mentionContext && mentionSuggestions.length);

  const updateMentionContext = (value, cursorPosition) => {
    const cursor = Number.isInteger(cursorPosition) ? cursorPosition : value.length;
    const match = value.slice(0, cursor).match(/(^|[\s(])@([A-Za-z0-9_]*)$/);
    if (!match) {
      setMentionContext(null);
      setSelectedMention(0);
      return;
    }
    setMentionContext({ query: match[2], start: cursor - match[2].length - 1, end: cursor });
    setSelectedMention(0);
  };

  const insertMention = (candidate) => {
    if (!mentionContext) return;
    const insertion = `@${candidate.username} `;
    const nextText = `${text.slice(0, mentionContext.start)}${insertion}${text.slice(mentionContext.end)}`;
    const nextCursor = mentionContext.start + insertion.length;
    setText(nextText);
    setMentionContext(null);
    setSelectedMention(0);
    window.requestAnimationFrame(() => {
      composerInputRef.current?.focus();
      composerInputRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  };

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

  const requestedPersonQuery = searchParams.get('find')?.trim() || '';
  const requestedConversationId = searchParams.get('conversation')?.trim() || '';
  useEffect(() => {
    if (loading || !requestedConversationId) return;
    const requested = conversations.find((conversation) => conversation._id === requestedConversationId);
    if (requested) { setActive(requested); setOpen(window.innerWidth > 820); }
  }, [conversations, loading, requestedConversationId]);
  useEffect(() => {
    if (loading || requestedPersonQuery.length < 2 || handledGlobalSearch.current === requestedPersonQuery) return;
    handledGlobalSearch.current = requestedPersonQuery;
    setOpen(true);
    setFriendPanel(true);
    setFriendQuery(requestedPersonQuery);
    setSearching(true);
    setError('');
    setNotice('');
    api.get('/users/search', { params: { q: requestedPersonQuery } })
      .then(({ data }) => setSearchResults(data))
      .catch((requestError) => setError(errorMessage(requestError)))
      .finally(() => setSearching(false));
  }, [loading, requestedPersonQuery]);

  useEffect(() => {
    if (!active) { setMessages([]); return undefined; }
    shouldAutoScroll.current = true;
    let disposed = false;
    let requestInFlight = false;
    setError(''); setMessages([]); setMessagesLoading(true);

    const loadMessages = async (initial = false) => {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const { data } = await api.get(`/conversations/${active._id}/messages`);
        if (!disposed) setMessages(data);
      } catch (requestError) {
        if (!disposed && initial) setError(errorMessage(requestError));
      } finally {
        requestInFlight = false;
        if (!disposed && initial) setMessagesLoading(false);
      }
    };

    loadMessages(true);
    const poller = window.setInterval(() => loadMessages(false), 3_000);
    return () => { disposed = true; window.clearInterval(poller); };
  }, [active?._id]);

  useEffect(() => {
    if (!shouldAutoScroll.current || messagesLoading) return;
    window.requestAnimationFrame(() => messageEndRef.current?.scrollIntoView({ block: 'end' }));
  }, [messages.length, messagesLoading, active?._id]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(''), 5_000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const chooseConversation = (conversation) => {
    setActive(conversation);
    setNotice('');
    setMentionContext(null);
    if (window.innerWidth <= 820) setOpen(false);
  };

  const send = async () => {
    if (!text.trim() || !active || sending) return;
    const content = text.trim();
    shouldAutoScroll.current = true;
    setText(''); setMentionContext(null); setSending(true); setError('');
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
        <div className="chat-notice-region" aria-live="polite">
          {error && <div className="chat-notice chat-notice-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError('')} aria-label="Dismiss error"><X size={15} /></button></div>}
          {notice && <div className="chat-notice chat-notice-success" role="status"><Check size={16} aria-hidden="true" /><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={15} /></button></div>}
        </div>
        <div className="message-list" ref={messageListRef} onScroll={() => {
          const element = messageListRef.current;
          if (!element) return;
          shouldAutoScroll.current = element.scrollHeight - element.scrollTop - element.clientHeight < 96;
        }}>
          {(loading || messagesLoading) && <div className="chat-loading" role="status"><span className="loading-spinner" />{loading ? 'Loading conversations...' : 'Loading messages...'}</div>}
          {!loading && !messagesLoading && messages.map((message) => {
            const ownMessage = message.senderType !== 'ai' && personId(message.sender) === personId(user);
            return <article className={`message ${message.senderType === 'ai' ? 'kaya-message' : ''} ${ownMessage ? 'own-message' : ''}`} key={message._id}><span className={`avatar ${message.senderType === 'ai' ? 'kaya-avatar' : 'avatar-plum'}`}>{message.senderType === 'ai' ? <KayaMascot size={28} decorative /> : initials(message.sender?.displayName || message.senderName)}</span><div className="message-body"><div className="message-meta"><b>{message.senderType === 'ai' ? 'Kaya' : message.sender?.displayName || message.senderName}</b><small>{formatDateTime(message.createdAt, user?.timezone, { hour: '2-digit', minute: '2-digit' })}</small></div><p><MessageContent content={message.content} /></p></div></article>;
          })}
          {!loading && !messagesLoading && active && !messages.length && <div className="empty-state"><MessageCircle size={28} /><h3>Start the conversation</h3><p>{active.kind === 'direct' ? `Say hello to ${activePerson?.displayName || 'your friend'}.` : 'Send an update, or mention @Kaya for task-aware guidance.'}</p></div>}
          {!loading && !messagesLoading && !active && <div className="empty-state"><Users size={28} /><h3>Your messages will appear here</h3><p>Add a friend for private chat, or create a team conversation.</p><button className="friend-action" onClick={() => { setOpen(true); setFriendPanel(true); }}>Add a friend</button></div>}
          <span className="message-scroll-anchor" ref={messageEndRef} aria-hidden="true" />
        </div>
        <div className="composer">
          <div className="mention-hint"><Sparkles size={14} /> Mention <b>@Kaya</b> for a summary or priority suggestion.</div>
          <div className="composer-shell">
            {mentionMenuOpen && <div className="mention-suggestions" id="chat-mention-suggestions" role="listbox" aria-label="Mention suggestions">
              <div className="mention-suggestions-label">Mention someone</div>
              {mentionSuggestions.map((candidate, index) => <button
                type="button"
                role="option"
                aria-selected={selectedMention === index}
                className={selectedMention === index ? 'active' : ''}
                id={`mention-option-${candidate.id}`}
                key={candidate.id}
                onPointerDown={(event) => { event.preventDefault(); insertMention(candidate); }}
                onMouseEnter={() => setSelectedMention(index)}
              >
                <span className={`avatar ${candidate.assistant ? 'kaya-avatar' : 'avatar-violet'}`}>{candidate.assistant ? <KayaMascot size={28} decorative /> : initials(candidate.displayName)}</span>
                <span><b>{candidate.displayName}</b><small>@{candidate.username}{candidate.assistant ? ' · Assistant' : ''}</small></span>
              </button>)}
            </div>}
            <div className="composer-box"><textarea
              ref={composerInputRef}
              value={text}
              onChange={(event) => { setText(event.target.value); updateMentionContext(event.target.value, event.target.selectionStart); }}
              onSelect={(event) => updateMentionContext(event.currentTarget.value, event.currentTarget.selectionStart)}
              onKeyDown={(event) => {
                if (mentionMenuOpen && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) {
                  event.preventDefault();
                  if (event.key === 'ArrowDown') setSelectedMention((current) => (current + 1) % mentionSuggestions.length);
                  else if (event.key === 'ArrowUp') setSelectedMention((current) => (current - 1 + mentionSuggestions.length) % mentionSuggestions.length);
                  else if (event.key === 'Escape') setMentionContext(null);
                  else insertMention(mentionSuggestions[selectedMention] || mentionSuggestions[0]);
                  return;
                }
                if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); }
              }}
              disabled={!active || sending}
              aria-label="Message"
              aria-autocomplete="list"
              aria-controls={mentionMenuOpen ? 'chat-mention-suggestions' : undefined}
              aria-expanded={mentionMenuOpen}
              aria-activedescendant={mentionMenuOpen ? `mention-option-${mentionSuggestions[selectedMention]?.id}` : undefined}
              placeholder={active ? `Message ${activeTitle}` : 'Choose a conversation to start chatting'}
              rows="1"
            /><button className="send-button" onClick={send} disabled={!active || !text.trim() || sending} aria-label="Send message"><Send size={17} /></button></div>
          </div>
        </div>
      </main>
    </section>
  );
}
