import { useEffect, useRef, type PointerEvent } from 'react';
import { tick } from './haptics';

const HOLD_MS = 450; // press this long to pick something up, as on a phone's home screen
const SLOP = 8; // moving further than this before then is a scroll, not a press
const EDGE = 64; // dragging this close to the top or bottom of the scrolling screen scrolls it

/** While something is held, the finger must move it, not scroll the page; only a non-passive listener stops iOS. */
const noScroll = (e: TouchEvent) => e.cancelable && e.preventDefault();

type Handlers = {
  /** Picked up at (x, y). `el` is the element that was pressed. */
  lift: (id: string, x: number, y: number, el: HTMLElement) => void;
  /** Moved to (x, y); `scrolled` is how far the screen has scrolled since the lift. */
  move: (x: number, y: number, scrolled: number) => void;
  /** Let go at (x, y). */
  drop: (x: number, y: number) => void;
};

/**
 * Press and hold to pick up, then drag; with `immediate`, a press picks up at once. Returns the pointer handlers for
 * each draggable element. Near the top or bottom of the scrolling `.screen` the screen scrolls along.
 */
export function useHoldDrag(handlers: Handlers & { immediate?: boolean }) {
  const latest = useRef(handlers);
  latest.current = handlers;
  const hold = useRef<{ timer: number; x: number; y: number } | null>(null);
  const held = useRef<{ screen: HTMLElement | null; scroll: number } | null>(null);

  const cancelHold = () => {
    if (hold.current) clearTimeout(hold.current.timer);
    hold.current = null;
  };
  const end = () => {
    held.current = null;
    document.removeEventListener('touchmove', noScroll);
  };
  useEffect(() => () => (cancelHold(), end()), []);

  return {
    bind: (id: string) => ({
      onPointerDown(e: PointerEvent<HTMLElement>) {
        if (e.button !== 0) return;
        const [el, x, y, pointer] = [e.currentTarget, e.clientX, e.clientY, e.pointerId];
        const start = () => {
          el.setPointerCapture?.(pointer);
          const screen = el.closest<HTMLElement>('.screen');
          held.current = { screen, scroll: screen?.scrollTop ?? 0 };
          document.addEventListener('touchmove', noScroll, { passive: false });
          latest.current.lift(id, x, y, el);
        };
        if (latest.current.immediate) return start();
        hold.current = { x, y, timer: window.setTimeout(() => ((hold.current = null), tick(), start()), HOLD_MS) };
      },
      onPointerMove(e: PointerEvent) {
        if (hold.current && Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) > SLOP) cancelHold();
        const h = held.current;
        if (!h) return;
        const box = h.screen?.getBoundingClientRect();
        if (box && e.clientY > box.bottom - EDGE) h.screen!.scrollTop += 12;
        else if (box && e.clientY < box.top + EDGE) h.screen!.scrollTop -= 12;
        latest.current.move(e.clientX, e.clientY, (h.screen?.scrollTop ?? 0) - h.scroll);
      },
      onPointerUp(e: PointerEvent) {
        cancelHold();
        if (!held.current) return;
        end();
        latest.current.drop(e.clientX, e.clientY);
      },
      onPointerCancel(e: PointerEvent) {
        cancelHold();
        if (!held.current) return;
        end();
        latest.current.drop(e.clientX, e.clientY);
      },
    }),
  };
}
