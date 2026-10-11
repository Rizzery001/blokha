import type { Notice } from '../game/usePresenter';

export function Toasts({ notices }: { notices: Notice[] }) {
  if (notices.length === 0) return null;
  return (
    <div className="pointer-events-none fixed left-1/2 top-3 z-30 -translate-x-1/2 flex flex-col items-center gap-1.5 w-[min(92vw,420px)]" data-testid="toasts" aria-live="polite">
      {notices.map((n) => (
        <div
          key={n.id}
          className={`toast rounded-xl px-4 py-2 text-sm font-bold shadow-xl backdrop-blur ${
            n.tone === 'good' ? 'bg-emerald-600/90 text-white' : n.tone === 'bad' ? 'bg-rose-700/90 text-white' : 'bg-stone-700/90 text-white'
          }`}
        >
          {n.text}
        </div>
      ))}
    </div>
  );
}
