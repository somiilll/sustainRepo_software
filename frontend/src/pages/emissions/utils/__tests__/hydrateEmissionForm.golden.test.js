/**
 * Phase 0 golden tests — `hydrateEmissionForm` (Edit-mode hydration).
 *
 * `hydrateEmissionForm` is the pure core of the Edit flow: it turns a stored
 * emission record into form state. Phase 4 will absorb it into
 * `recordToFormState`, so its output is snapshot-locked here against REAL
 * records exported from the database (one per scope/category/method
 * combination).
 *
 * Regenerate the input fixtures with:
 *   cd /app/backend && python3 tests/golden/export_hydrate_fixtures.py
 * Snapshots must only be updated deliberately, never with `-u` during a
 * refactor that is supposed to be behaviour-neutral.
 */
import { hydrateEmissionForm } from '../hydrateEmissionForm';
import fixtures from './fixtures/hydrate-fixtures.json';

const { config } = fixtures;

describe('hydrateEmissionForm — real record coverage', () => {
  it('exports a representative fixture set', () => {
    expect(fixtures.fixtures.length).toBeGreaterThanOrEqual(20);
  });

  fixtures.fixtures.forEach(({ fixture_id: fixtureId, bucket, emission }) => {
    it(`hydrates ${fixtureId} (${bucket})`, () => {
      expect(hydrateEmissionForm(emission, config)).toMatchSnapshot();
    });
  });
});

describe('hydrateEmissionForm — defensive behaviour', () => {
  it('defaults frequency type to monthly', () => {
    const result = hydrateEmissionForm(
      { id: 'x', scope: 'scope1', category: 'Stationary Combustion' },
      {},
    );
    expect(result.frequencyType).toBe('monthly');
  });

  it('normalises a "Month YYYY" reporting period to YYYY-MM', () => {
    const result = hydrateEmissionForm(
      { id: 'x', scope: 'scope1', category: 'Stationary Combustion', reporting_period: 'February 2025' },
      {},
    );
    expect(JSON.stringify(result)).toContain('2025-02');
  });

  it('keeps an already normalised reporting period untouched', () => {
    const result = hydrateEmissionForm(
      { id: 'x', scope: 'scope1', category: 'Stationary Combustion', reporting_period: '2025-07' },
      {},
    );
    expect(JSON.stringify(result)).toContain('2025-07');
  });
});
