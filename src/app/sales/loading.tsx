export default function SalesLoading() {
  return (
    <div className="animate-pulse">
      <div className="h-5 w-32 bg-[var(--border)] rounded mb-6" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-5">
            <div className="h-10 bg-[var(--border)] rounded mb-4" />
            <div className="flex gap-2 mb-4">
              {[1,2,3].map(i => <div key={i} className="h-7 w-16 bg-[var(--border)] rounded-full" />)}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Array.from({length: 6}).map((_, i) => <div key={i} className="h-16 bg-[var(--border)] rounded-md" />)}
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-5 h-48" />
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-5 h-36" />
        </div>
      </div>
    </div>
  );
}
