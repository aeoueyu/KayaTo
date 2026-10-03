import { ArrowLeft, ArrowRight, Check, Users, UserRound, Workflow } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Brand from '../components/Brand';

const choices = [
  { id: 'personal', icon: UserRound, title: 'Personal productivity', copy: 'Plan your day, track habits, and stay ahead of bills.' },
  { id: 'team', icon: Users, title: 'Team collaboration', copy: 'Assign work, discuss progress, and keep delivery visible.' },
  { id: 'both', icon: Workflow, title: 'A bit of both', copy: 'Keep personal and shared work together in one place.' },
];

export default function Onboarding() {
  const [selected, setSelected] = useState('both');
  const navigate = useNavigate();
  return <div className="onboarding-page"><header><Link to="/"><Brand/></Link><span>Step 1 of 4</span></header><div className="progress-track"><i/></div><main><Link to="/" className="back-link"><ArrowLeft size={17}/> Back</Link><span className="eyebrow">Make KayaTo yours</span><h1>What would you like to organize?</h1><p>This only shapes your starting workspace. You can use every feature anytime.</p><div className="choice-grid">{choices.map(({id,icon:Icon,title,copy})=><button key={id} className={`choice-card ${selected === id ? 'selected' : ''}`} onClick={()=>setSelected(id)}><span className="choice-icon"><Icon size={23}/></span><span><b>{title}</b><small>{copy}</small></span><span className="selection-indicator">{selected === id && <Check size={15}/>}</span></button>)}</div><div className="onboarding-actions"><span>You can change this later in Settings.</span><button className="button button-primary" onClick={()=>navigate('/app')}>Continue <ArrowRight size={17}/></button></div></main></div>;
}
