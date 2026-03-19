export default function LoginLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="w-full max-w-sm">
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-8 animate-pulse">
          <div className="h-5 w-28 bg-[var(--border)] rounded mb-2" />
          <div className="h-3 w-20 bg-[var(--border)] rounded mb-8" />
          <div className="space-y-4">
            <div className="h-10 bg-[var(--border)] rounded" />
            <div className="h-10 bg-[var(--border)] rounded" />
            <div className="h-10 bg-[var(--accent)] rounded opacity-30" />
          </div>
        </div>
      </div>
    </div>
  );
}
