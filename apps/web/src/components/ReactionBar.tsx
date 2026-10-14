import { PHRASES, REACTIONS } from '@blokha/shared';

export function ReactionBar({ onSend }: { onSend: (emoji: string) => void }) {
  return (
    <div className="flex gap-1 flex-wrap items-center" data-testid="reactions">
      {REACTIONS.map((e) => (
        <button key={e} type="button" onClick={() => onSend(e)} className="w-9 h-9 rounded-lg bg-stone-700/70 text-xl hover:scale-110 transition-transform" aria-label={`Реакция ${e}`}>
          {e}
        </button>
      ))}
      <span className="w-px h-6 bg-stone-600/60 mx-1" />
      {(Object.keys(PHRASES) as (keyof typeof PHRASES)[]).map((k) => (
        <button key={k} type="button" onClick={() => onSend(k)} className="h-9 px-2.5 rounded-lg bg-stone-700/70 text-xs font-bold hover:scale-105 transition-transform whitespace-nowrap">
          {PHRASES[k]}
        </button>
      ))}
    </div>
  );
}
