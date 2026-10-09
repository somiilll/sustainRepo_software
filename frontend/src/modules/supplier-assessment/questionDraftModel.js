let draftSequence = 0;
let optionSequence = 0;

export const createQuestionOption = (text = '', score = '') => ({
  id: `question-option-${++optionSequence}`,
  value: '',
  text,
  score,
});

const yesNoPointScores = (question) => {
  const scores = question.point_scores || {};
  const yes = Number(scores.yes_score ?? scores.yes_with_evidence_score ?? question.max_points ?? 1);
  const no = Number(scores.no_score ?? 0);
  return { yes, no };
};

export const draftFingerprint = (draft) => JSON.stringify({
  question_text: draft.question_text.trim(),
  response_type: draft.response_type,
  required: draft.required,
  yes_score: Number(draft.yes_score),
  no_score: Number(draft.no_score),
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
  yes_score: 1,
  no_score: 0,
  options: [createQuestionOption(), createQuestionOption()],
  evidence_mandatory: false,
  evidence_affects_score: false,
  missing_evidence_percent: 50,
  order: 0,
  parent_question_id: null,
  };
  return { ...draft, original_fingerprint: draftFingerprint(draft) };
};

export const hydrateQuestionDraft = (question) => {
  const { yes, no } = yesNoPointScores(question);
  const evidenceMandatory = ['required', 'evidence_scored'].includes(question.evidence_requirement);
  const evidenceAffectsScore = question.evidence_requirement === 'evidence_scored';
  const withoutEvidence = Number(question.point_scores?.yes_without_evidence_score ?? yes / 2);
  const draft = {
    ...createQuestionDraft(question.category, question.question_category || 'policy'),
    source_id: question.id,
    question_text: question.question_text || '',
    description: question.description || '',
    response_type: question.response_type,
    required: question.required !== false,
    yes_score: yes,
    no_score: no,
    options: (question.options || []).map((option) => ({
      id: `question-option-${++optionSequence}`,
      value: String(option.value || ''),
      text: String(option.label || option.value || ''),
      score: option.score ?? question.scoring?.choices?.[option.value] ?? '',
    })),
    evidence_mandatory: evidenceMandatory,
    evidence_affects_score: evidenceAffectsScore,
    missing_evidence_percent: yes > 0 ? Math.round((withoutEvidence / yes) * 10000) / 100 : 50,
    order: question.order || 0,
    parent_question_id: question.parent_question_id || null,
  };
  return { ...draft, original_fingerprint: draftFingerprint(draft) };
};

export const questionDraftMaxPoints = (draft) => {
  if (draft.response_type === 'dropdown') {
    return Math.max(0, ...draft.options.map((option) => Number(option.score)).filter(Number.isFinite));
  }
  return Math.max(Number(draft.yes_score) || 0, Number(draft.no_score) || 0);
};

export const validateQuestionDraft = (draft) => {
  if (!draft.question_text.trim()) return 'Enter the question text.';
  if (!['yes_no', 'dropdown'].includes(draft.response_type)) return 'Only Yes / No and Multiple choice questions can be configured here.';
  if (draft.response_type === 'yes_no') {
    const yesScore = Number(draft.yes_score);
    const noScore = Number(draft.no_score);
    if (![yesScore, noScore].every((score) => Number.isFinite(score) && score >= 0)) return 'Yes score and No score must be numbers of 0 or more.';
    if (yesScore <= 0 && noScore <= 0) return 'At least one Yes/No score must be above 0.';
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
  const yesScore = Number(draft.yes_score) || 0;
  const noScore = Number(draft.no_score) || 0;
  const missingEvidencePoints = yesScore * Number(draft.missing_evidence_percent || 0) / 100;
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
    yes_score: yesScore,
    yes_with_evidence_score: yesScore,
    yes_without_evidence_score: evidenceRequirement === 'evidence_scored' ? missingEvidencePoints : yesScore,
    no_score: noScore,
  };
  const scoring = draft.response_type === 'dropdown'
    ? { rule: 'choice_mapping', choices: Object.fromEntries(options.map((option) => [option.value, option.score])) }
    : { rule: 'boolean', true_score: maxPoints ? yesScore / maxPoints * 100 : 0, false_score: maxPoints ? noScore / maxPoints * 100 : 0 };
  return {
    question_text: draft.question_text.trim(),
    description: draft.description || '',
    response_type: draft.response_type,
    options,
    required: true,
    evidence_requirement: evidenceRequirement,
    assessment_type: assessmentType,
    max_points: maxPoints,
    point_scores: pointScores,
    missing_evidence_percent: evidenceRequirement === 'evidence_scored' ? Number(draft.missing_evidence_percent) : null,
    weight: maxPoints,
    exact_numerical_weight: maxPoints,
    category: draft.category,
    question_category: draft.question_category,
    order,
    parent_question_id: draft.parent_question_id || null,
    scoring,
  };
};

export const isLegacyQuestionType = (question) => !['yes_no', 'dropdown'].includes(question.response_type);