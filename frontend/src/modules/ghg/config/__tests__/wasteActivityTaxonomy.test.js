import {
  getWasteDisposalCategoryKey,
  resolveWasteActivityFactor,
} from '../wasteActivityTaxonomy';

describe('shared C5/C12 waste activity taxonomy', () => {
  it('recognizes both canonical category identities', () => {
    expect(getWasteDisposalCategoryKey('waste_generated_in_operations')).toBe('c5');
    expect(getWasteDisposalCategoryKey('C12 - End-of-Life Treatment of Sold Products')).toBe('c12');
  });

  it('derives a base activity and disposal type from legacy C12 names', () => {
    expect(resolveWasteActivityFactor({ activity: 'Mixed Plastics - Recycled' })).toMatchObject({
      activity_name: 'Mixed Plastics',
      activity_type: 'recycled',
    });
  });

  it('keeps factor IDs and treats variantless activities as other', () => {
    expect(resolveWasteActivityFactor({ id: 'factor-1', activity: 'Waste Water Treatment' })).toMatchObject({
      id: 'factor-1',
      activity_name: 'Waste Water Treatment',
      activity_type: 'other',
    });
  });
});