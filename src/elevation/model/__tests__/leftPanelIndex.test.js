import { describe, expect, it } from 'vitest';
import { LEFT_PANEL_INDEX, matchingLeftPanel } from '../leftPanelIndex.js';

describe('left-panel settings search', () => {
  it('anchors 1/2: matches labels and keeps every label for a block-title match', () => {
    expect(matchingLeftPanel('bead')).toEqual([
      { id: 'left.style', title: 'Style & door styles', labels: ['Bead width'] },
    ]);
    expect(matchingLeftPanel('  BeAd  ')).toEqual(matchingLeftPanel('bead'));
    expect(matchingLeftPanel('part numbers')).toEqual([{
      id: 'left.parts', title: 'Part numbers & report',
      labels: ['Part number start', 'Room note', 'Molding notes', 'Part numbers'],
    }]);
    expect(matchingLeftPanel('walls')).toEqual([LEFT_PANEL_INDEX[0]]);
    expect(matchingLeftPanel('edge')[0].labels).toEqual(['Outside edge', 'Profiled edge']);
  });

  it('anchor 3: omits empty searches and matches labels only, without room-height duplicates', () => {
    for (const query of ['', '   ', 'zzz', 'shaker', 'Crown']) {
      expect(matchingLeftPanel(query)).toEqual([]);
    }
    expect(matchingLeftPanel('height')).toEqual([
      { id: 'left.walls', title: 'Walls', labels: ['Wall height'] },
    ]);
  });
});
