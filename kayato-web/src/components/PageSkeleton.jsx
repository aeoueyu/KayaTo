function Bone({ className = '' }) {
  return <span className={`skeleton-bone ${className}`} aria-hidden="true" />;
}

export default function PageSkeleton({ variant = 'app' }) {
  if (variant === 'landing') {
    return (
      <div className="page-skeleton landing-skeleton" role="status" aria-live="polite" aria-busy="true">
        <span className="skeleton-status">Loading page</span>
        <header className="skeleton-marketing-nav">
          <Bone className="skeleton-logo" />
          <div className="skeleton-nav-links"><Bone /><Bone /><Bone /></div>
          <div className="skeleton-nav-actions"><Bone /><Bone /></div>
        </header>
        <main className="skeleton-landing-main">
          <Bone className="skeleton-kicker" />
          <Bone className="skeleton-hero-title" />
          <Bone className="skeleton-hero-title skeleton-hero-title-short" />
          <Bone className="skeleton-copy" />
          <Bone className="skeleton-copy skeleton-copy-short" />
          <div className="skeleton-button-row"><Bone /><Bone /></div>
          <Bone className="skeleton-hero-media" />
        </main>
      </div>
    );
  }

  if (variant === 'auth') {
    return (
      <div className="page-skeleton auth-skeleton" role="status" aria-live="polite" aria-busy="true">
        <span className="skeleton-status">Loading page</span>
        <header className="skeleton-auth-header"><Bone className="skeleton-logo" /><Bone className="skeleton-round" /></header>
        <main className="skeleton-auth-layout">
          <section className="skeleton-auth-card">
            <Bone className="skeleton-kicker" /><Bone className="skeleton-auth-title" /><Bone className="skeleton-copy" />
            <div className="skeleton-social-row"><Bone /><Bone /><Bone /></div>
            <Bone className="skeleton-field" /><Bone className="skeleton-field" /><Bone className="skeleton-submit" />
          </section>
          <Bone className="skeleton-auth-visual" />
        </main>
      </div>
    );
  }

  return (
    <section className="page-skeleton app-page-skeleton page-block" role="status" aria-live="polite" aria-busy="true">
      <span className="skeleton-status">Loading page</span>
      <div className="skeleton-page-heading"><div><Bone className="skeleton-app-title" /><Bone className="skeleton-app-copy" /></div><Bone className="skeleton-heading-action" /></div>
      <div className="skeleton-stat-grid"><Bone /><Bone /><Bone /></div>
      <div className="skeleton-content-grid"><Bone className="skeleton-content-main" /><Bone className="skeleton-content-side" /></div>
    </section>
  );
}
