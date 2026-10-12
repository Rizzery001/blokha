import { PieceShape } from './PieceShapes';

/**
 * Фишка-шашка: объёмный диск цвета игрока, на нём силуэт фигуры.
 * Номер — маленький ярлык на ободе, пройденный круг — золотое кольцо.
 */
export function PieceToken({ color, kind, index, lapDone = false, size = 'board' }: { color: string; kind: string; index: number; lapDone?: boolean; size?: 'board' | 'small' }) {
  return (
    <span className={`token ${size === 'small' ? 'token-small' : ''} ${lapDone ? 'token-lap' : ''}`} style={{ ['--pc' as string]: color }} aria-hidden>
      <span className="token-disc">
        <span className="token-rim" />
        <span className="token-face">
          <PieceShape kind={kind} color="#fffaf0" className="token-shape" />
        </span>
        <span className="token-num">{index}</span>
      </span>
    </span>
  );
}
