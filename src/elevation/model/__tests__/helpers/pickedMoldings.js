import { readFileSync } from 'node:fs';

const { settings: { sectionProfiles } } = JSON.parse(readFileSync(new URL('../fixtures/golden.json', import.meta.url), 'utf8'));

/** Historical molding tests explicitly choose the rectangle profiles used by the golden rooms. */
export function pickedMoldings(settings) {
  return { ...settings, sectionProfiles: [...(settings.sectionProfiles ?? []), ...sectionProfiles],
    defaultProfile: { ...settings.defaultProfile, topMoldProfileId: 'golden-top-mold', crownProfileId: 'golden-crown' } };
}
