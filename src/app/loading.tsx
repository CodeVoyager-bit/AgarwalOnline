export default function Loading() {
  return (
    <div className="page-container" aria-busy="true" aria-live="polite">
      <span className="eyebrow">LOADING</span>
      <div className="skeleton skeleton-title" />
      <div className="skeleton-grid">
        <div className="skeleton" />
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
      <span className="sr-only">Loading this page</span>
    </div>
  );
}
