import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useHoldDrag } from '../drag';
import type { Trip } from '../schemas';
import { setTripOrder } from '../store';
import { Hare } from '../ui';

/** The cover: the trip's photo, or the hare on a soft green tile. `name` lets the photo glide into the trip's header. */
export function Cover({ url, tripId, className = 'cover' }: { url?: string; tripId: string; className?: string }) {
  const style = { viewTransitionName: `cover-${tripId}` } as CSSProperties;
  return url ? (
    <img className={className} src={url} alt="" style={style} draggable={false} />
  ) : (
    <span className={`${className} placeholder`} style={style}>
      <Hare size={56} />
    </span>
  );
}

/** Reduce Motion: cards jump to their new place instead of sliding (styles.css stops only CSS animations). */
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

type Drag = { id: string; sx: number; sy: number; x: number; y: number; left: number; top: number; scrolled: number };

/**
 * The trips as a two-column grid of cards. Press and hold a card to arrange: the cards wiggle, the held one lifts and
 * follows the finger, and the others slide out of its way. Also by keyboard: the Menu key (or a right-click) starts
 * arranging, and the arrow keys move the focused card. The order is saved on this phone when a card is let go.
 */
export function TripGrid(props: { trips: Trip[]; photos: Record<string, string>; onOpen: (id: string) => void; arranging: boolean; onArrange: () => void }) {
  const { trips, photos, arranging } = props;
  const [order, setOrder] = useState<string[] | null>(null); // while arranging: the order on screen, before it is saved
  const [lifted, setLifted] = useState<string | null>(null);
  const ids = order ?? trips.map((t) => t.id);
  // The order as it is right now. Pointer moves can come faster than React re-renders, so the drag logic reads this,
  // set at once on every move, not `ids`, which is only as new as the last render (a quick drag saved the old order).
  const now = useRef(ids);
  now.current = ids;
  const byId = new Map(trips.map((t) => [t.id, t]));
  const items = useRef(new Map<string, HTMLLIElement>());
  const grid = useRef<HTMLUListElement>(null);
  const drag = useRef<Drag | null>(null);
  const slots = useRef(new Map<string, { left: number; top: number }>()); // where each card was before a move

  // The saved order has come back from the database: show it instead of the local copy.
  const saved = trips.map((t) => t.id).join();
  useEffect(() => {
    if (!drag.current) setOrder(null);
  }, [saved]);

  /** Puts the lifted card under the finger, wherever its slot in the grid now is. */
  const place = () => {
    const d = drag.current;
    const li = d && items.current.get(d.id);
    if (!d || !li) return;
    li.style.transform = `translate(${d.left + d.x - d.sx - li.offsetLeft}px, ${d.top + d.y - d.sy + d.scrolled - li.offsetTop}px)`;
  };

  /** Shows a new order; the cards that moved slide from their old slot to the new one (after the render, below). */
  const reorder = (next: string[]) => {
    slots.current = new Map(now.current.map((id) => [id, { left: items.current.get(id)?.offsetLeft ?? 0, top: items.current.get(id)?.offsetTop ?? 0 }]));
    now.current = next;
    setOrder(next);
  };
  useLayoutEffect(() => {
    for (const [id, old] of slots.current) {
      const li = items.current.get(id);
      if (!li || id === drag.current?.id) continue;
      const [dx, dy] = [old.left - li.offsetLeft, old.top - li.offsetTop];
      if ((dx || dy) && !still()) li.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
    }
    slots.current = new Map();
    place();
  });

  const save = (next: string[]) => void setTripOrder(next);

  const drags = useHoldDrag({
    immediate: arranging, // once arranging, a card moves as soon as it is pressed
    lift(id, x, y) {
      const li = items.current.get(id);
      if (!li) return;
      props.onArrange();
      drag.current = { id, sx: x, sy: y, x, y, left: li.offsetLeft, top: li.offsetTop, scrolled: 0 };
      setOrder(now.current);
      setLifted(id);
    },
    move(x, y, scrolled) {
      const d = drag.current;
      if (!d) return;
      Object.assign(d, { x, y, scrolled });
      place();
      // The slot nearest to the middle of the lifted card is where it goes. Slots are the grid's places as drawn
      // (whichever card is in them), so this holds even when the last move has not been drawn yet.
      const li = items.current.get(d.id)!;
      const cx = d.left + x - d.sx + li.offsetWidth / 2;
      const cy = d.top + y - d.sy + scrolled + li.offsetHeight / 2;
      const ids = now.current;
      let best = ids.indexOf(d.id);
      let bestDistance = Infinity;
      [...(grid.current?.children ?? [])].forEach((slot, i) => {
        const s = slot as HTMLElement;
        const distance = Math.hypot(s.offsetLeft + s.offsetWidth / 2 - cx, s.offsetTop + s.offsetHeight / 2 - cy);
        if (distance < bestDistance) [best, bestDistance] = [i, distance];
      });
      if (best !== ids.indexOf(d.id)) reorder(ids.filter((id) => id !== d.id).toSpliced(best, 0, d.id));
    },
    drop() {
      const d = drag.current;
      drag.current = null;
      setLifted(null);
      const li = d && items.current.get(d.id);
      if (!d || !li) return;
      // Settle into its slot from where it was let go.
      const from = li.style.transform;
      li.style.transform = '';
      if (from && !still()) li.animate([{ transform: from }, { transform: 'none' }], { duration: 200, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
      save(now.current);
    },
  });

  /** Arrow keys while arranging: left and right one place, up and down one row (two cards). */
  function key(e: React.KeyboardEvent, id: string) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -2, ArrowDown: 2 }[e.key];
    if (!arranging || !step) return;
    e.preventDefault();
    const ids = now.current;
    const to = Math.min(Math.max(ids.indexOf(id) + step, 0), ids.length - 1);
    if (to === ids.indexOf(id)) return;
    const next = ids.filter((x) => x !== id).toSpliced(to, 0, id);
    reorder(next);
    save(next);
  }

  return (
    <ul ref={grid} className={`trip-grid${arranging ? ' arranging' : ''}`} onDragStart={(e) => e.preventDefault()}>
      {ids.map((id, i) => {
        const t = byId.get(id);
        if (!t) return null;
        return (
          <li
            key={id}
            ref={(el) => void (el ? items.current.set(id, el) : items.current.delete(id))}
            className={lifted === id ? 'lifted' : undefined}
            style={{ '--i': i } as CSSProperties}
            {...drags.bind(id)}
          >
            <button
              className="trip-card"
              aria-roledescription={arranging ? 'movable trip' : undefined}
              onClick={() => !arranging && props.onOpen(id)}
              onContextMenu={(e) => (e.preventDefault(), props.onArrange())}
              onKeyDown={(e) => key(e, id)}
            >
              <Cover url={photos[id]} tripId={id} />
              <span className="trip-name">{t.name}</span>
              <small>{t.baseCurrency}</small>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
