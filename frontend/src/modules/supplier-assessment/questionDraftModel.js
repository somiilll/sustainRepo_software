let draftSequence = 0;
let optionSequence = 0;

export const createQuestionOption = (text = '', score = '') => ({
  id: `question-option-${++optionSequence}`,
  value: '',
  text,
  score,
});

const preferredPointScore = (question) => {
  const scores = question.point_scores || {};
  const yes = Math.max(Number(scores.yes_score || 0), Number(scores.yes_with_evidence_score || 0));
  const no = Number(scores.no_score || 0);
  return { preferredAnswer: no > yes ? 'no' : 'yes', points: Math.max(yes, no, Number(question.max_points || 0), 1) };
};

export const draftFingerprint = (draft) => JSON.stringify({
  question_text: draft.question_text.trim(),
  response_type: draft.response_type,
  required: draft.required,
  preferred_answer: draft.preferred_answer,
  preferred_points: Number(draft.preferred_points),
  options: draft.options.map((option) => ({ value: option.value, text: option.text.trim(), score: Number(option.score) })),
  evidence_mandatory: draft.evidence_mandatory,
  evidence_affects_score: draft.evidence_affects_score,
  missing_evidence_percent: Number(draft.missing_evidence_percent),
});

export const createQuestionDraft = (section, category) => {
  const draft = {
  draft_id: `draft-question-${++draftSequence}`,
  source_id: '',
  question_text: '',
  description: '',
  category: section,
  question_category: category,
  response_type: 'yes_no',
  required: true,
  preferred_answer: 'yes',
  preferred_points: 1,
  options: [createQuestionOption(), createQuestionOption()],
  evidence_mandatory: false,
  evidence_affects_score: false,
  missing_evidence_percent: 50,
  order: 0,
  };
  return { ...draft, original_fingerprint: draftFingerprint(draft) };
};

export const hydrateQuestionDraft = (question) => {
  const { preferredAnswer, points } = preferredPointScore(question);
  const evidenceMandatory = ['required', 'evidence_scored'].includes(question.evidence_requirement);
  const evidenceAffectsScore = question.evidence_requirement === 'evidence_scored';
  const withoutEvidence = Number(question.point_scores?.yes_without_evidence_score ?? points / 2);
  const draft = {
    ...createQuestionDraft(question.category, question.question_category || 'policy'),
    source_id: question.id,
    question_text: question.question_text || '',
    description: question.description || '',
    response_type: question.response_type,
    required: question.required !== false,
    preferred_answer: preferredAnswer,
    preferred_points: points,
    options: (question.options || []).map((option) => ({
      id: `question-option-${++optionSequence}`,
      value: String(option.value || ''),
      text: String(option.label || option.value || ''),
      score: option.score ?? question.scoring?.choices?.[option.value] ?? '',
    })),
    evidence_mandatory: evidenceMandatory,
    evidence_affects_score: evidenceAffectsScore,
    missing_evidence_percent: points > 0 ? Math.round((withoutEvidence / points) * 10000) / 100 : 50,
    order: question.order || 0,
  };
  return { ...draft, original_fingerprint: draftFingerprint(draft) };
};

export const questionDraftMaxPoints = (draft) => {
  if (draft.response_type === 'dropdown') {
    return Math.max(0, ...draft.options.map((option) => Number(option.score)).filter(Number.isFinite));
  }
  return Number(draft.preferred_points) || 0;
};

export const validateQuestionDraft = (draft) => {
  if (!draft.question_text.trim()) return 'Enter the question text.';
  if (!['yes_no', 'dropdown'].includes(draft.response_type)) return 'Only Yes / No and Multiple choice questions can be configured here.';
  if (draft.response_type === 'yes_no') {
    const points = Number(draft.preferred_points);
    if (!Number.isFinite(points) || points <= 0) return 'Points for the preferred answer must be a number above 0.';
  }
  if (draft.response_type === 'dropdown') {
    if (draft.options.length < 2) return 'Add at least two multiple-choice options.';
    const normalizedText = draft.options.map((option) => option.text.trim().toLowerCase());
    if (normalizedText.some((text) => !text)) return 'Every option needs option text.';
    if (new Set(normalizedText).size !== normalizedText.length) return 'Multiple-choice option text must be unique.';
    const scores = draft.options.map((option) => Number(option.score));
    if (scores.some((score) => !Number.isFinite(score) || score < 0)) return 'Every option needs a numeric score of 0 or more.';
    if (!scores.some((score) => score > 0)) return 'At least one option must have a score above 0.';
  }
  if (draft.evidence_mandatory && draft.evidence_affects_score) {
    const percent = Number(draft.missing_evidence_percent);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) return 'The missing-evidence percentage must be between 0 and 100.';
  }
  return '';
};

export const questionDraftToPayload = (draft, order = draft.order || 0) => {
  const maxPoints = questionDraftMaxPoints(draft);
  const preferredYes = draft.preferred_answer === 'yes';
  const missingEvidencePoints = maxPoints * Number(draft.missing_evidence_percent || 0) / 100;
  const evidenceRequirement = !draft.evidence_mandatory
    ? 'not_required'
    : draft.evidence_affects_score ? 'evidence_scored' : 'required';
  const assessmentType = draft.response_type === 'dropdown' && evidenceRequirement !== 'evidence_scored'
    ? 'standard'
    : evidenceRequirement === 'required' ? 'type_a' : evidenceRequirement === 'evidence_scored' ? 'type_c' : 'type_b';
  const options = draft.response_type === 'dropdown' ? draft.options.map((option) => ({
    value: option.value || option.text.trim(),
    label: option.text.trim(),
    score: Number(option.score),
  })) : [];
  const pointScores = {
    yes_score: preferredYes ? maxPoints : 0,
    yes_with_evidence_score: preferredYes ? maxPoints : 0,
    yes_without_evidence_score: preferredYes && evidenceRequirement === 'evidence_scored' ? missingEvidencePoints : preferredYes ? maxPoints : 0,
    no_score: preferredYes ? 0 : maxPoints,
  };
  const scoring = draft.response_type === 'dropdown'
    ? { rule: 'choice_mapping', choices: Object.fromEntries(options.map((option) => [option.value, option.score])) }
    : { rule: 'boolean', true_score: preferredYes ? 100 : 0, false_score: preferredYes ? 0 : 100 };
  return {
    question_text: draft.question_text.trim(),
    description: draft.description || '',
    response_type: draft.response_type,
    options,
    required: draft.required,
    evidence_requirement: evidenceRequirement,
    assessment_type: assessmentType,
    max_points: maxPoints,
    point_scores: pointScores,
    weight: maxPoints,
    exact_numerical_weight: maxPoints,
    category: draft.category,
    question_category: draft.question_category,
    order,
    parent_question_id: null,
    scoring,
  };
};

export const isLegacyQuestionType = (question) => !['yes_no', 'dropdown'].includes(question.response_type);