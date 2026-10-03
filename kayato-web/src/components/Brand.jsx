export default function Brand({ compact = false }) {
  return (
    <div className={`brand ${compact ? 'brand-compact' : ''}`} aria-label="KayaTo">
      {compact ? (
        <>
          <img className="brand-logo-icon brand-logo-icon-light" src="/brand/kayato-redlogo.svg" alt="" aria-hidden="true" draggable="false" />
          <img className="brand-logo-icon brand-logo-icon-dark" src="/brand/kayato-whitelogo.svg" alt="" aria-hidden="true" draggable="false" />
        </>
      ) : (
        <>
          <img className="brand-wordmark brand-wordmark-light" src="/brand/kayato-textlogo_black.svg" alt="" aria-hidden="true" draggable="false" />
          <img className="brand-wordmark brand-wordmark-dark" src="/brand/kayato-textlogo_allwhite.svg" alt="" aria-hidden="true" draggable="false" />
        </>
      )}
    </div>
  );
}
