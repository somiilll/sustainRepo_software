import { getEmissionUpdateErrorMessage } from '../apiErrorMessage';

describe('getEmissionUpdateErrorMessage', () => {
  test('shows a FastAPI string detail', () => {
    const error = { response: { data: { detail: 'Emission record is locked' } } };
    expect(getEmissionUpdateErrorMessage(error)).toBe('Emission record is locked');
  });

  test('shows and cleans a Pydantic validation detail', () => {
    const error = {
      response: {
        data: {
          detail: [{ msg: 'Value error, No. of Days Travelled must be between 0 and 30 days for the reporting month' }],
        },
      },
    };
    expect(getEmissionUpdateErrorMessage(error)).toBe(
      'No. of Days Travelled must be between 0 and 30 days for the reporting month',
    );
  });

  test('joins multiple validation details without duplicates', () => {
    const error = {
      response: {
        data: {
          detail: [
            { msg: 'Value error, Days are invalid' },
            { msg: 'Value error, Days are invalid' },
            { message: 'Nights are invalid' },
          ],
        },
      },
    };
    expect(getEmissionUpdateErrorMessage(error)).toBe('Days are invalid, Nights are invalid');
  });

  test('uses the fallback when the response has no usable detail', () => {
    expect(getEmissionUpdateErrorMessage({})).toBe('Failed to update emissions. Please try again.');
  });
});