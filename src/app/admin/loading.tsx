export default function AdminLoading() {
  return (
    <div className="animate-pulse">
      <div className="h-5 w-28 bg-[var(--border)] rounded mb-6" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
            <div className="h-3 w-16 bg-[var(--border)] rounded mb-2" />
            <div className="h-6 w-12 bg-[var(--border)] rounded" />
          </div>
        ))}
      </div>
      <div className="h-4 w-28 bg-[var(--border)] rounded mb-3" />
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4 h-64" />
    </div>
  );
}
