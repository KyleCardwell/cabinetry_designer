import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

export const CURSORS = {
  draw: 'crosshair',
  panReady: 'grab',
  panning: 'grabbing',
  select: 'pointer',
  move: 'move',
  resizeX: 'ew-resize',
  explain: 'help',
  idle: 'default',
};

/** A held gesture wins, then the newest hover, then the canvas's resting cursor. */
export function resolveCursor({ base = CURSORS.idle, hover = null, hold = null }) {
  return hold ?? hover ?? base;
}

export function elevationBaseCursor(tool, pointerMode) {
  if (pointerMode === 'panning') return CURSORS.panning;
  if (pointerMode === 'pan-ready') return CURSORS.panReady;
  return ['draw', 'door', 'window'].includes(tool) ? CURSORS.draw : CURSORS.idle;
}

export function planBaseCursor(tool, pointerMode) {
  if (pointerMode === 'panning') return CURSORS.panning;
  if (pointerMode === 'pan-ready') return CURSORS.panReady;
  return tool === 'wall' ? CURSORS.draw : CURSORS.idle;
}

/** Own one canvas's cursor: `style` goes on the container, `controller` goes to children. */
export function useCanvasCursor(base) {
  const requests = useRef(new Map());
  const [hover, setHover] = useState(null);
  const [hold, setHold] = useState(null);
  const settle = useCallback(() => {
    const values = [...requests.current.values()];
    setHover(values.length > 0 ? values[values.length - 1] : null);
  }, []);
  const controller = useMemo(() => ({
    request(key, cursor) {
      requests.current.delete(key);
      requests.current.set(key, cursor);
      settle();
    },
    release(key) {
      if (requests.current.delete(key)) settle();
    },
    hold(cursor) { setHold(cursor); },
    releaseHold() { setHold(null); },
  }), [settle]);
  return { style: resolveCursor({ base, hover, hold }), controller };
}

/** Bind a child to a canvas cursor. Its keys are released when it unmounts. */
export function useCursorKeys(controller) {
  const owner = useId();
  const held = useRef(new Set());
  useEffect(() => () => {
    held.current.forEach((key) => controller?.release(key));
    held.current.clear();
  }, [controller]);
  return useMemo(() => ({
    request(name, cursor) {
      const key = `${owner}:${name}`;
      held.current.add(key);
      controller?.request(key, cursor);
    },
    release(name) {
      const key = `${owner}:${name}`;
      held.current.delete(key);
      controller?.release(key);
    },
  }), [controller, owner]);
}
