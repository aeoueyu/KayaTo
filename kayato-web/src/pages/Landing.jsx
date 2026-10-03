import {
  ArrowRight,
  Bot,
  CalendarCheck,
  Check,
  CreditCard,
  FileUp,
  FolderKanban,
  Image,
  Menu,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Brand from '../components/Brand';
import KayaMascot from '../components/KayaMascot';
import ThemeToggle from '../components/ThemeToggle';

const steps = [
  { icon: FileUp, title: 'Bring work into focus', copy: 'Add a brief, note, or file. Kaya turns the important parts into a clear starting point.', tone: 'amber' },
  { icon: FolderKanban, title: 'Shape the plan together', copy: 'Review tasks, priorities, ownership, and dependencies before work begins.', tone: 'violet' },
  { icon: CalendarCheck, title: 'Keep progress visible', copy: 'See what is moving, what needs attention, and what should happen next.', tone: 'cyan' },
];

const reasons = [
  { icon: Sparkles, title: 'Plans you can edit', copy: 'Kaya suggests a structure. You stay in control of every task and decision.', tone: 'green' },
  { icon: Users, title: 'Workload with context', copy: 'Assignments consider skills, availability, ownership, and the needs of the project.', tone: 'blue' },
  { icon: MessageCircle, title: 'Answers where work happens', copy: 'Ask Kaya inside team chat for summaries, decisions, and the next useful action.', tone: 'amber' },
];

function TypingText({ text }) {
  const [visibleCharacters, setVisibleCharacters] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisibleCharacters(text.length);
      return undefined;
    }

    let typingTimer;
    const startTimer = window.setTimeout(() => {
      typingTimer = window.setInterval(() => {
        setVisibleCharacters((current) => {
          if (current >= text.length) {
            window.clearInterval(typingTimer);
            return current;
          }
          return current + 1;
        });
      }, 34);
    }, 240);

    return () => {
      window.clearTimeout(startTimer);
      window.clearInterval(typingTimer);
    };
  }, [text]);

  const isComplete = visibleCharacters >= text.length;

  return (
    <span className={`typing-text ${isComplete ? 'is-complete' : ''}`} aria-label={text}>
      <span className="typing-measure" aria-hidden="true">{text}</span>
      <span className="typing-output" aria-hidden="true">
        {text.slice(0, visibleCharacters)}
        <span className="typing-cursor" />
      </span>
    </span>
  );
}

function ImagePlaceholder({ name, title, copy, className = '' }) {
  const [loaded, setLoaded] = useState(false);
  const revealOnScroll = className.includes('hero-image-slot');
  const [revealed, setRevealed] = useState(!revealOnScroll);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!revealOnScroll) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof IntersectionObserver === 'undefined') {
      setRevealed(true);
      return undefined;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setRevealed(true);
        observer.disconnect();
      }
    }, { threshold: 0.06, rootMargin: '0px 0px 12% 0px' });

    const element = containerRef.current;
    if (element) observer.observe(element);
    return () => observer.disconnect();
  }, [revealOnScroll]);

  return (
    <div ref={containerRef} className={`landing-image-placeholder ${loaded ? 'has-image' : ''} ${revealOnScroll ? 'hero-handoff' : ''} ${revealed ? 'is-revealed' : ''} ${className}`}>
      <img className="landing-slot-image" src={`/landing/${name}`} alt={loaded ? title : ''} loading={className.includes('hero-image-slot') ? 'eager' : 'lazy'} onLoad={() => setLoaded(true)} onError={() => setLoaded(false)} />
      {!loaded && <div className="placeholder-content" role="img" aria-label={`${title} placeholder`}><span className="placeholder-icon"><Image size={24} /></span><strong>{title}</strong><small>{copy}</small><code>{name}</code></div>}
    </div>
  );
}

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pageRef = useRef(null);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return undefined;

    const elements = [...page.querySelectorAll('[data-reveal]')];
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof IntersectionObserver === 'undefined') {
      elements.forEach((element) => element.classList.add('is-visible'));
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px 10% 0px' });

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={pageRef} className="marketing-page reference-landing">
      <a className="skip-link" href="#marketing-content">Skip to main content</a>

      <header className="marketing-nav">
        <Link to="/" className="brand-link"><Brand /></Link>
        <nav className={menuOpen ? 'open' : ''} aria-label="Primary navigation">
          <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
          <a href="#why" onClick={() => setMenuOpen(false)}>Why KayaTo</a>
          <a href="#teams" onClick={() => setMenuOpen(false)}>For teams</a>
        </nav>
        <div className="marketing-actions">
          <ThemeToggle label={false} />
          <Link to="/login" className="text-link">Log in</Link>
          <Link to="/onboarding" className="button button-primary button-small">Get started</Link>
          <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen}>
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      <main id="marketing-content" tabIndex="-1">
        <section className="reference-hero">
          <div className="reference-hero-copy">
            <div className="hero-kicker">
              <KayaMascot size={34} decorative />
              <TypingText text="Meet Kaya, your project planning assistant" />
            </div>
            <h1>Plan clearly. Move together. Finish what matters.</h1>
            <p>KayaTo brings tasks, files, conversations, and deadlines into one focused workspace.</p>
            <div className="reference-hero-actions">
              <Link to="/onboarding" className="button button-primary">Create your workspace <ArrowRight size={18} /></Link>
              <a href="#features" className="button button-secondary">Explore features</a>
            </div>
          </div>

          <ImagePlaceholder className="hero-image-slot" name="hero/hero-dashboard.webp" title="Main KayaTo dashboard image" copy="Recommended size: 1600 x 980" />
        </section>

        <section className="steps-section" id="features">
          <div className="centered-section-heading" data-reveal><h2>From scattered work to a clear next step</h2><p>KayaTo helps you understand the work, organize it, and keep everyone moving.</p></div>
          <div className="steps-grid">
            {steps.map(({ icon: Icon, title, copy, tone }) => (
              <article className={`step-card step-card-${tone}`} key={title} data-reveal><span><Icon size={24} /></span><h3>{title}</h3><p>{copy}</p></article>
            ))}
          </div>
        </section>

        <section className="why-section" id="why">
          <div className="centered-section-heading" data-reveal><h2>Why teams choose KayaTo</h2><p>Less time reconstructing context. More time making steady progress.</p></div>
          <div className="why-layout">
            <div data-reveal><ImagePlaceholder className="people-image-slot" name="team-at-work.webp" title="Team or workspace photo" copy="Recommended size: 900 x 1050" /></div>
            <div className="reason-list">
              {reasons.map(({ icon: Icon, title, copy, tone }) => (
                <article className={`reason-item reason-item-${tone}`} key={title} data-reveal><span><Icon size={21} /></span><div><h3>{title}</h3><p>{copy}</p></div></article>
              ))}
            </div>
          </div>
        </section>

        <section className="showcase-section">
          <div className="centered-section-heading" data-reveal><h2>See the whole project without losing the details</h2><p>Use one visual for the dashboard, task board, or team workspace you want to highlight.</p></div>
          <div data-reveal><ImagePlaceholder className="showcase-image-slot" name="workspace-overview.webp" title="Product workspace image" copy="Recommended size: 1600 x 960" /></div>
        </section>

        <section className="use-cases-section">
          <div className="use-cases-copy" data-reveal><h2>One workspace for the work around your work</h2><p>Plan projects, stay ahead of bills, keep team conversations useful, and turn files into action.</p></div>
          <div className="use-case-list">
            <span data-reveal><FolderKanban size={19} /> Projects and tasks</span><span data-reveal><Bot size={19} /> AI planning</span><span data-reveal><MessageCircle size={19} /> Team chat</span><span data-reveal><CreditCard size={19} /> Bills and reminders</span><span data-reveal><ShieldCheck size={19} /> Controlled assignments</span><span data-reveal><CalendarCheck size={19} /> Calendar visibility</span>
          </div>
        </section>

        <section className="reference-final-cta" id="teams">
          <div data-reveal><h2>Ready to give every project a clearer start?</h2><p>Create your workspace, organize today, and invite your team when the plan is ready.</p><ul><li><Check size={16} /> Personal and team work</li><li><Check size={16} /> Editable AI suggestions</li><li><Check size={16} /> No card required</li></ul><Link to="/onboarding" className="button button-primary">Start organizing <ArrowRight size={18} /></Link></div>
          <div data-reveal><ImagePlaceholder className="cta-image-slot" name="final-cta-team.webp" title="Final CTA lifestyle image" copy="Recommended size: 900 x 700" /></div>
        </section>
      </main>

      <footer className="reference-footer" data-reveal>
        <div><img className="footer-wordmark" src="/brand/kayato-textlogo_allwhite.svg" alt="KayaTo" draggable="false" /><p>Plan clearly. Work together.</p></div>
        <nav aria-label="Footer navigation"><a href="#features">Features</a><a href="#why">Why KayaTo</a><Link to="/login">Log in</Link></nav>
        <div><span>© 2026 KayaTo</span><Link to="/onboarding" className="button button-light">Create workspace</Link></div>
      </footer>
    </div>
  );
}
