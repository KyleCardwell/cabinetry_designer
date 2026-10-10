/** Shop-standard tongue and curve dimensions in inches, and stile shifts by kind. */
const EPS = 1e-6;
const TONGUE = 0.25;
const TONGUE_IN = 0.5;
const TONGUE_LENGTH = 0.75;
const CURVE_END = 0.625;
const PANEL_SHOWN = 3;
const GHOST_KINDS = { door_outside: 0, door_inside: 1, door_panel: 1, applied_molding: 1 };

function round6(v) {
  const rounded = Number(v.toFixed(6));
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** Door ghost places the stile, groove and flush-back panel relative to the kind's origin. */
export function profileDoorGhost(kind, style) {
  const P = style?.panel?.thickness;
  if (!Object.hasOwn(GHOST_KINDS, kind)
    || !Number.isFinite(style?.thickness)
    || !Number.isFinite(P) || P <= EPS || P >= style.thickness - EPS
    || !Number.isFinite(style?.stiles?.left) || style.stiles.left <= TONGUE_IN) return null;

  const T = style.thickness;
  const S = style.stiles.left;
  const dx = -GHOST_KINDS[kind] * S;
  const pf = -(T - P);
  const rabbet = P <= TONGUE + EPS;
  const tb = rabbet ? -T : pf - Math.min(TONGUE, P);
  const h = P - TONGUE;
  const radius = rabbet ? null : (0.375 ** 2 + h ** 2) / (2 * h);
  const e = dx + S;
  const point = (x, y) => [round6(x), round6(y)];
  const line = (from, to) => ({ type: 'line', from, to });
  const points = {
    s1: point(dx, 0),
    s2: point(e, 0),
    s3: point(e, pf),
    s4: point(e - TONGUE_IN, pf),
    s5: point(e - TONGUE_IN, tb),
    ...(!rabbet ? { s6: point(e, tb), s7: point(e, -T) } : {}),
    s8: point(dx, -T),
    p1: point(e - TONGUE_IN, pf),
    p2: point(e + PANEL_SHOWN, pf),
    p3: point(e + PANEL_SHOWN, -T),
    ...(!rabbet ? {
      p4: point(e + CURVE_END, -T),
      p5: point(e - TONGUE_IN + TONGUE_LENGTH, tb),
    } : {}),
    p6: point(e - TONGUE_IN, tb),
  };
  const loops = [
    {
      id: 'stile',
      closed: true,
      segs: [
        line('s1', 's2'), line('s2', 's3'), line('s3', 's4'), line('s4', 's5'),
        ...(rabbet ? [line('s5', 's8')] : [line('s5', 's6'), line('s6', 's7'), line('s7', 's8')]),
        line('s8', 's1'),
      ],
    },
    {
      id: 'panel',
      closed: true,
      segs: [
        line('p1', 'p2'), line('p2', 'p3'),
        ...(rabbet ? [line('p3', 'p6')] : [line('p3', 'p4'), {
          type: 'arc', from: 'p4', to: 'p5',
          center: point(e - TONGUE_IN + TONGUE_LENGTH, tb - radius), ccw: true,
        }, line('p5', 'p6')]),
        line('p6', 'p1'),
      ],
    },
  ];
  return { units: 'in', points, loops };
}
