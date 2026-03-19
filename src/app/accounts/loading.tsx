export default function AccountsLoading() {
  return (
    <div className="animate-pulse">
      <div className="h-5 w-28 bg-[var(--border)] rounded mb-6" />
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-5 mb-6">
        <div className="flex gap-3 mb-4">
          <div className="h-10 flex-1 bg-[var(--border)] rounded" />
          <div className="h-10 w-20 bg-[var(--border)] rounded" />
          <div className="h-10 w-24 bg-[var(--border)] rounded" />
        </div>
      </div>
    </div>
  );
}
