import { useMemo } from 'react';
import {
  belowRowOffsets,
  dimensionRowOffsets,
  layoutDimensionRow,
} from '../../canvas/dimensionLayout.js';
import {
  horizontalChains,
  nearerEdge,
  openingChain,
  clearanceCallouts,
  pickColumnRuns,
  verticalChains,
  verticalOpeningChain,
  wallRow,
} from '../../model/dimensions.js';
import { wallExtent } from '../../model/wallExtent.js';
import { openingGeometry } from '../../model/openings.js';

export function useDimensionChains({ room, wall, settings, selection }) {
  const dimensionChains = useMemo(() => {
    if (!room || !wall) return null;
    const lower = horizontalChains(room, wall, 'lower', settings);
    const upper = horizontalChains(room, wall, 'upper', settings);
    const selectedOpening = (wall.openings ?? []).find(
      (opening) => opening.id === selection.openingId,
    );
    const openingCenter = selectedOpening
      ? (() => {
        const jamb = openingGeometry(selectedOpening, wall.length, settings).jamb;
        return jamb.x + jamb.width / 2;
      })()
      : null;
    const verticalFor = (edge) => (selectedOpening
      && nearerEdge(openingCenter, wall.length) === edge
      ? verticalOpeningChain(wall, selectedOpening, wall.length, settings)
      : verticalChains(room, wall, pickColumnRuns(wall, selection.runId, edge), settings, edge));
    return {
      lower,
      upper,
      openings: openingChain(room, wall, settings),
      // DM3: the overall wall row, on faces with runs only; it takes the openings row's place.
      wall: wallRow(room, wall, settings, lower.outer),
      clearances: clearanceCallouts(room, wall, settings),
      vertical: {
        left: verticalFor('left'),
        right: verticalFor('right'),
      },
    };
  }, [room, selection.openingId, selection.runId, settings, wall]);

  return { dimensionChains };
}

export function useDimensionOffsets({ dimensionChains, room, settings, transform, wall }) {
  const dimensionOffsets = useMemo(() => {
    if (!dimensionChains || !transform) return null;
    const factor = transform.text?.dimension ?? 1;
    const fontSize = 11 * factor;
    const lowerLevels = layoutDimensionRow(dimensionChains.lower.inner, {
      scale: transform.scale,
      fontSize,
    }).levels;
    const upperLevels = layoutDimensionRow(dimensionChains.upper.inner, {
      scale: transform.scale,
      fontSize,
    }).levels;
    const lowerOuterLevels = layoutDimensionRow(dimensionChains.lower.outer, {
      scale: transform.scale,
      fontSize,
    }).levels;
    // Only one of the openings and wall rows is ever drawn (DM3 §1.3); it sits in the third slot.
    const openingLevels = layoutDimensionRow([...dimensionChains.openings, ...dimensionChains.wall], {
      scale: transform.scale,
      fontSize,
    }).levels;
    const verticalLevels = {
      left: layoutDimensionRow(dimensionChains.vertical.left.inner, {
        scale: transform.scale,
        fontSize,
      }).levels,
      right: layoutDimensionRow(dimensionChains.vertical.right.inner, {
        scale: transform.scale,
        fontSize,
      }).levels,
    };
    const extent = wallExtent(room, wall, settings);
    const clear = {
      below: Math.max(0, -extent.bottom) * transform.scale,
      above: Math.max(0, extent.top - wall.height) * transform.scale,
      left: Math.max(0, -extent.left) * transform.scale,
      right: Math.max(0, extent.right - wall.length) * transform.scale,
    };
    const below = belowRowOffsets({
      clearanceRow: false,
      pieces: lowerLevels,
      overall: lowerOuterLevels,
      openings: openingLevels,
    }, factor);
    const upper = dimensionRowOffsets('horizontal', upperLevels, false, factor);
    const vertical = {
      left: dimensionRowOffsets(
        'vertical',
        verticalLevels.left,
        dimensionChains.vertical.left.middle.length > 0,
        factor,
      ),
      right: dimensionRowOffsets(
        'vertical',
        verticalLevels.right,
        dimensionChains.vertical.right.middle.length > 0,
        factor,
      ),
    };
    return {
      lower: {
        inner: below.pieces + clear.below,
        outer: below.overall + clear.below,
      },
      upper: {
        inner: upper.inner + clear.above,
        outer: upper.outer + clear.above,
      },
      vertical: {
        left: {
          inner: vertical.left.inner + clear.left,
          middle: vertical.left.middle + clear.left,
          outer: vertical.left.outer + clear.left,
        },
        right: {
          inner: vertical.right.inner + clear.right,
          middle: vertical.right.middle + clear.right,
          outer: vertical.right.outer + clear.right,
        },
      },
      openings: below.openings + clear.below,
      wall: below.openings + clear.below,
      label: below.label + clear.below,
      clear,
    };
  }, [dimensionChains, room, settings, transform, wall]);

  return { dimensionOffsets };
}
