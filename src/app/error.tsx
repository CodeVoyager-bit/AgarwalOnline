"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="auth-card empty-state utility-card">
      <span className="eyebrow">SOMETHING WENT WRONG</span>
      <h1>This page needs another try.</h1>
      <p>Your basket and account are safe. Refresh this view to continue.</p>
      <button className="primary-button" type="button" onClick={reset}>Try again</button>
    </div>
  );
}
