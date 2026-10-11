import { REACTIONS } from '@blokha/shared';

export function ReactionBar({ onSend }: { onSend: (emoji: string) => void }) {
  return (
    <div className="flex gap-1 flex-wrap" data-testid="reactions">
      {REACTIONS.map((e) => (
        <button key={e} type="button" onClick={() => onSend(e)} className="w-9 h-9 rounded-lg bg-stone-700/70 text-xl hover:scale-110 transition-transform" aria-label={`Реакция ${e}`}>
          {e}
        </button>
      ))}
    </div>
  );
}
