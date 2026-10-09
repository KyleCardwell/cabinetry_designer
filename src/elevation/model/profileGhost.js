/** SPEC-48.2 fixed panel, tongue and curve dimensions in inches, and stile shifts by kind. */
const PANEL_THICKNESS = 0.5;
const TONGUE = 0.25;
const TONGUE_IN = 0.5;
const TONGUE_LENGTH = 0.75;
const CURVE_END = 0.625;
const CURVE_RADIUS = 0.40625;
const PANEL_SHOWN = 3;
const GHOST_KINDS = { door_outside: 0, door_inside: 1, door_panel: 1, applied_molding: 1 };

function round6(v) {
  const rounded = Number(v.toFixed(6));
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** SPEC-48.2 door ghost places the stile, groove and panel relative to the kind's origin. */
export function profileDoorGhost(kind, style) {
  if (!Object.hasOwn(GHOST_KINDS, kind)
    || !Number.isFinite(style?.thickness) || style.thickness <= PANEL_THICKNESS
    || !Number.isFinite(style?.stiles?.left) || style.stiles.left <= TONGUE_IN) return null;

  const T = style.thickness;
  const S = style.stiles.left;
  const dx = -GHOST_KINDS[kind] * S;
  const pf = -(T - PANEL_THICKNESS);
  const tb = pf - TONGUE;
  const e = dx + S;
  const point = (x, y) => [round6(x), round6(y)];
  const line = (from, to) => ({ type: 'line', from, to });
  const points = {
    s1: point(dx, 0),
    s2: point(e, 0),
    s3: point(e, pf),
    s4: point(e - TONGUE_IN, pf),
    s5: point(e - TONGUE_IN, tb),
    s6: point(e, tb),
    s7: point(e, -T),
    s8: point(dx, -T),
    p1: point(e - TONGUE_IN, pf),
    p2: point(e + PANEL_SHOWN, pf),
    p3: point(e + PANEL_SHOWN, -T),
    p4: point(e + CURVE_END, -T),
    p5: point(e - TONGUE_IN + TONGUE_LENGTH, tb),
    p6: point(e - TONGUE_IN, tb),
  };
  const loops = [
    {
      id: 'stile',
      closed: true,
      segs: [
        line('s1', 's2'), line('s2', 's3'), line('s3', 's4'), line('s4', 's5'),
        line('s5', 's6'), line('s6', 's7'), line('s7', 's8'), line('s8', 's1'),
      ],
    },
    {
      id: 'panel',
      closed: true,
      segs: [
        line('p1', 'p2'), line('p2', 'p3'), line('p3', 'p4'),
        {
          type: 'arc', from: 'p4', to: 'p5',
          center: point(e - TONGUE_IN + TONGUE_LENGTH, tb - CURVE_RADIUS), ccw: true,
        },
        line('p5', 'p6'), line('p6', 'p1'),
      ],
    },
  ];
  return { units: 'in', points, loops };
}
