import { buildYearlyPayload } from '../payload-builder';

describe('C7 calculation version binding', () => {
  it('copies immutable calculation references from the calculated employee row', () => {
    const payload = buildYearlyPayload({
      facilityId: 'facility-1',
      category: 'C7 - Employee Commuting',
      calculationMethod: 'activity_basis',
      activityType: 'car',
      reportingYear: '2026',
      yearType: 'calendar',
      employees: [{
        id: 'employee-1',
        name: 'Employee 1',
        yearly_data: {
          inputs: { km_travelled: 100 },
          emissions: { co2e: 1.5 },
          calculation_details: {
            formula_id: 'F1',
            formula_version_id: 'F1-v1',
            decision_tree_version_id: 'TREE-v1',
            formula_name: 'Formula 1',
          },
        },
      }],
    });

    expect(payload.formula_id).toBe('F1');
    expect(payload.formula_version_id).toBe('F1-v1');
    expect(payload.decision_tree_version_id).toBe('TREE-v1');
  });
});