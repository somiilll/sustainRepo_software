import { getCategoryFuelAllowedUnits } from '../../utils/fuelUnits';

describe('getCategoryFuelAllowedUnits', () => {
  it('uses the Fugitive fuel-master units without a hardcoded unit list', () => {
    const units = getCategoryFuelAllowedUnits({
      scope: 'scope1',
      categoryName: 'Fugitive Emissions',
      fuelDatabase: [
        { scope: 'scope1', categories: ['Fugitive Emissions'], allowed_units: ['kg', 'g', 't'] },
        { scope: 'scope1', category: 'Fugitive Emissions', allowed_units: ['kg', 'lb'] },
        { scope: 'scope1', category: 'Mobile Combustion', allowed_units: ['L'] },
      ],
    });

    expect(units).toEqual(['kg', 'g', 't', 'lb']);
  });
});