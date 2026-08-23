import React from 'react';
import { Badge } from '../../../components/ui/badge';
import { CheckCircle, Circle } from 'lucide-react';

const formatAnswer = (answer) => {
  if (typeof answer === 'boolean') return answer ? 'Yes' : 'No';
  if (Array.isArray(answer)) return answer.join(', ');
  if (typeof answer === 'object' && answer !== null) return JSON.stringify(answer);
  return String(answer);
};

export default function QuestionnaireResponseList({ questionnaire }) {
  const questions = questionnaire.questions || [];

  if (!questions.length) {
    return <p className="mt-4 text-sm text-stone-500" data-testid={`questionnaire-${questionnaire.questionnaire_id}-responses-unavailable`}>Question responses are unavailable.</p>;
  }

  return (
    <section className="mt-4 border-t border-stone-100 pt-4" data-testid={`questionnaire-${questionnaire.questionnaire_id}-responses`}>
      <p className="mb-3 text-sm font-medium text-stone-800" data-testid={`questionnaire-${questionnaire.questionnaire_id}-responses-title`}>Questions and responses</p>
      <ol className="space-y-3" data-testid={`questionnaire-${questionnaire.questionnaire_id}-question-list`}>
        {questions.map((question, index) => {
          const answered = question.answer !== undefined && question.answer !== null && question.answer !== '';
          return (
            <li className="flex gap-3" key={question.id} data-testid={`questionnaire-${questionnaire.questionnaire_id}-question-${question.id}`}>
              {answered ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-stone-300" />}
              <div className="min-w-0">
                <p className="text-sm text-stone-800" data-testid={`questionnaire-${questionnaire.questionnaire_id}-question-${index + 1}-text`}>{question.question_text}</p>
                {answered ? <p className="mt-1 break-words text-sm text-stone-600" data-testid={`questionnaire-${questionnaire.questionnaire_id}-question-${index + 1}-answer`}>{formatAnswer(question.answer)}</p> : <Badge variant="outline" className="mt-1 text-stone-500" data-testid={`questionnaire-${questionnaire.questionnaire_id}-question-${index + 1}-pending`}>Pending response</Badge>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}