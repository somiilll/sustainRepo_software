import {
  createQuestionDraft,
  createQuestionOption,
  questionDraftMaxPoints,
  questionDraftToPayload,
  validateQuestionDraft,
} from './questionDraftModel';

describe('question draft model', () => {
  it('stores independent Yes and No scores', () => {
    const draft = {
      ...createQuestionDraft('environment', 'policy'),
      question_text: 'Score both answers independently',
      yes_score: 3,
      no_score: 12,
    };

    const payload = questionDraftToPayload(draft);

    expect(payload.max_points).toBe(12);
    expect(payload.point_scores.yes_score).toBe(3);
    expect(payload.point_scores.no_score).toBe(12);
    expect(payload.scoring).toMatchObject({ rule: 'boolean', true_score: 25, false_score: 100 });
  });

  it('always stores questions as mandatory', () => {
    const draft = {
      ...createQuestionDraft('environment', 'policy'),
      question_text: 'Mandatory even when editing an optional legacy question',
      required: false,
    };

    expect(questionDraftToPayload(draft).required).toBe(true);
  });

  it('calculates multiple-choice max points from the highest option score', () => {
    const draft = {
      ...createQuestionDraft('environment', 'policy'),
      question_text: 'Choose one option',
      response_type: 'dropdown',
      options: [createQuestionOption('First', 4), createQuestionOption('Second', 9)],
    };

    expect(questionDraftMaxPoints(draft)).toBe(9);
    expect(questionDraftToPayload(draft).max_points).toBe(9);
  });

  it.each([
    {
      name: 'fewer than two options',
      options: [createQuestionOption('Only', 1)],
      message: 'at least two',
    },
    {
      name: 'duplicate option text',
      options: [createQuestionOption('Same', 1), createQuestionOption(' same ', 2)],
      message: 'unique',
    },
    {
      name: 'negative score',
      options: [createQuestionOption('First', -1), createQuestionOption('Second', 2)],
      message: '0 or more',
    },
    {
      name: 'no positive score',
      options: [createQuestionOption('First', 0), createQuestionOption('Second', 0)],
      message: 'above 0',
    },
  ])('rejects $name', ({ options, message }) => {
    const draft = {
      ...createQuestionDraft('environment', 'policy'),
      question_text: 'Choose one option',
      response_type: 'dropdown',
      options,
    };

    expect(validateQuestionDraft(draft)).toContain(message);
  });

  it('stores the configured missing-evidence percentage per question', () => {
    const draft = {
      ...createQuestionDraft('social', 'labour'),
      question_text: 'Provide evidence',
      yes_score: 20,
      no_score: 0,
      evidence_mandatory: true,
      evidence_affects_score: true,
      missing_evidence_percent: 35,
    };

    const payload = questionDraftToPayload(draft);

    expect(payload.evidence_requirement).toBe('evidence_scored');
    expect(payload.point_scores.yes_with_evidence_score).toBe(20);
    expect(payload.point_scores.yes_without_evidence_score).toBe(7);
  });
});