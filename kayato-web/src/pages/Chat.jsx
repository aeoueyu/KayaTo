import { AtSign, ChevronLeft, ChevronRight, FileText, Hash, Info, Paperclip, Search, Send, Smile, Sparkles, Users } from 'lucide-react';
import { useState } from 'react';
import KayaMascot from '../components/KayaMascot';

const startingMessages = [
  { id:1, sender:'Alex Mercado', initials:'AM', time:'9:18 AM', text:'I uploaded the revised capstone requirements. We should divide the remaining work today.', tone:'plum' },
  { id:2, sender:'Alex Mercado', initials:'AM', time:'9:19 AM', file:'Capstone requirements v2.pdf', meta:'2.4 MB · PDF', tone:'plum' },
  { id:3, sender:'Juan Dela Cruz', initials:'JD', time:'9:24 AM', text:'@Kaya can you summarize the changes and suggest what we should prioritize?', tone:'peach' },
  { id:4, sender:'Kaya', initials:'K', time:'9:24 AM', ai:true, text:'The revision adds three requirements: notification preferences, pagination for task lists, and validation for invite links. I suggest prioritizing invite-link validation first because it affects both security and team onboarding.', actions:['Create task draft','Show all changes'] },
];

export default function Chat() {
  const [messages,setMessages]=useState(startingMessages);
  const [text,setText]=useState('');
  const [channelQuery,setChannelQuery]=useState('');
  const [channelsOpen,setChannelsOpen]=useState(()=>window.innerWidth>820);
  const send=()=>{ if(!text.trim())return; const userMessage={id:Date.now(),sender:'Jamie Aquino',initials:'JA',time:'Now',text,tone:'sand'}; const mentionsKaya=/@kaya/i.test(text); setMessages(current=>[...current,userMessage]); setText(''); if(mentionsKaya){setTimeout(()=>setMessages(current=>[...current,{id:Date.now()+1,sender:'Kaya',initials:'K',time:'Now',ai:true,text:'I can help with that. I prepared a concise starting point based on this channel’s tasks and recent discussion.',actions:['Review suggestion']}]),450);}}

  return <section className={`chat-page ${channelsOpen?'channels-open':'channels-collapsed'}`}>
    <aside className="channel-list">
      <div className="channel-list-head"><b>Conversations</b><button className="icon-button channel-list-collapse" onClick={()=>setChannelsOpen(false)} aria-label="Collapse conversations"><ChevronLeft size={16}/></button></div>
      <label className="channel-search"><Search size={16}/><input value={channelQuery} onChange={event=>setChannelQuery(event.target.value)} aria-label="Search conversations" placeholder="Search conversations"/></label>
      <div className="channel-section"><div><b>Teams</b><button aria-label="Add team channel" title="Add team channel">+</button></div><button className="channel active"><Hash size={16}/><span><b>general</b><small>4 unread messages</small></span><i>4</i></button><button className="channel"><Hash size={16}/><span><b>development</b><small>Juan: API is ready</small></span></button><button className="channel"><Hash size={16}/><span><b>design</b><small>Alex: Updated the flow</small></span></button></div>
      <div className="channel-section"><div><b>Direct messages</b><button aria-label="Start direct message" title="Start direct message">+</button></div><button className="channel"><span className="avatar avatar-plum">AM</span><span><b>Alex Mercado</b><small>Active now</small></span><i className="online-dot"/></button><button className="channel"><span className="avatar kaya-avatar"><KayaMascot size={28} decorative /></span><span><b>Kaya</b><small>AI assistant</small></span></button></div>
    </aside>
    {channelsOpen&&<button className="channel-scrim" onClick={()=>setChannelsOpen(false)} aria-label="Close conversations"/>}
    <main className="conversation">
      <header className="conversation-head">
        <div className="conversation-heading-wrap"><button className="icon-button channel-toggle" data-tooltip={channelsOpen?'Collapse conversations':'Open conversations'} onClick={()=>setChannelsOpen(open=>!open)} aria-expanded={channelsOpen} aria-label={channelsOpen?'Collapse conversations':'Open conversations'}>{channelsOpen?<ChevronLeft size={16}/>:<ChevronRight size={16}/>}</button><div className="conversation-heading"><span className="channel-title"><Hash size={19}/><b>general</b></span><small>Plan together, share updates, and ask @Kaya for help.</small></div></div>
        <div><button className="icon-button" aria-label="Search messages" title="Search messages"><Search size={18}/></button><button className="icon-button" aria-label="View channel members" title="Channel members"><Users size={18}/></button><button className="icon-button" aria-label="Channel details" title="Channel details"><Info size={18}/></button></div>
      </header>
      <div className="message-list"><div className="date-divider"><span>Today</span></div>{messages.map(message=><Message message={message} key={message.id}/>)}</div>
      <div className="composer"><div className="mention-hint"><Sparkles size={14}/> Mention <b>@Kaya</b> to summarize, explain, or create a task draft.</div><div className="composer-box"><button aria-label="Attach file" title="Attach file"><Paperclip size={19}/></button><textarea value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}} placeholder="Message #general - press Enter to send" rows="1"/><button aria-label="Mention a person" title="Mention a person"><AtSign size={18}/></button><button aria-label="Add reaction" title="Add reaction"><Smile size={18}/></button><button className="send-button" onClick={send} disabled={!text.trim()} aria-label="Send message" title="Send message"><Send size={17}/></button></div></div>
    </main>
  </section>;
}

function Message({message}) { return <article className={`message ${message.ai?'ai-message':''}`}><span className={`avatar ${message.ai?'kaya-avatar':`avatar-${message.tone}`}`}>{message.ai?<KayaMascot size={28} decorative />:message.initials}</span><div className="message-body"><div className="message-meta"><b>{message.sender}</b>{message.ai&&<span>AI assistant</span>}<small>{message.time}</small></div>{message.text&&<p>{highlightMention(message.text)}</p>}{message.file&&<div className="message-file"><span><FileText size={19}/></span><div><b>{message.file}</b><small>{message.meta}</small></div></div>}{message.actions&&<div className="message-actions">{message.actions.map((action,index)=><button key={action} className={index===0?'primary':''}>{action}</button>)}</div>}</div></article>; }

function highlightMention(text){ const parts=text.split(/(@Kaya)/gi); return parts.map((part,index)=>/@kaya/i.test(part)?<mark key={index}>{part}</mark>:part); }
