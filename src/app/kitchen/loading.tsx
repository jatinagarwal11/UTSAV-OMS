export default function KitchenLoading() {
  return (
    <div className="animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div className="h-5 w-40 bg-[var(--border)] rounded" />
        <div className="h-3 w-24 bg-[var(--border)] rounded" />
      </div>
      <div className="flex gap-1 mb-6 border-b border-[var(--border)]">
        {[1,2,3].map(i => <div key={i} className="h-8 w-28 bg-[var(--border)] rounded -mb-[1px]" />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-5 h-52" />)}
      </div>
    </div>
  );
}
