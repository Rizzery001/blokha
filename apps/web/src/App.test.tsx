import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createSequenceDiceRoller } from '@blokha/game-engine';
import { App } from './App';

// jsdom не знает про ?fast, поэтому анимации идут с реальными задержками — используем fake timers
describe('локальная игра в браузере (jsdom)', () => {
  it('настройка → партия → шестёрка выставляет фигуру на угол', async () => {
    const dice = createSequenceDiceRoller([6, 2, 3]);
    render(<App dice={dice} />);
    fireEvent.click(screen.getByTestId('play-local'));
    // два человека
    fireEvent.click(screen.getByTestId('bot-1'));
    fireEvent.change(screen.getByTestId('nick-0'), { target: { value: 'Аня' } });
    fireEvent.click(screen.getByTestId('start-game'));
    expect(screen.getByTestId('board')).toBeTruthy();
    expect(screen.getByTestId('status').textContent).toContain('Аня');

    fireEvent.click(screen.getByTestId('roll'));
    // ждём анимацию кубика (650 мс) и обновление
    await act(() => new Promise((r) => setTimeout(r, 900)));
    expect(screen.getByTestId('status').textContent).toContain('выпало 6');
    const reserve = screen.getByTestId('reserve-p1-1') as HTMLButtonElement;
    expect(reserve.disabled).toBe(false);
    fireEvent.click(reserve);
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(screen.getByTestId('cell-A1').querySelector('[data-testid="piece-p1-1"]')).toBeTruthy();
    // бонусный бросок остаётся у Ани
    expect(screen.getByTestId('status').textContent).toContain('бонусный бросок');
  }, 15000);
});
