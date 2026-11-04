import React from 'react';

const PRINCIPLES = [
  ['P1', 'Ethics, Transparency and Accountability'], ['P2', 'Sustainable and Safe Products/Services'],
  ['P3', 'Employee Wellbeing'], ['P4', 'Stakeholder Responsiveness'], ['P5', 'Human Rights'],
  ['P6', 'Environment Protection'], ['P7', 'Policy Advocacy'], ['P8', 'Inclusive Growth'], ['P9', 'Customer Value'],
];

const REASONS = {
  not_material: 'Principles not considered material to the business',
  not_ready: 'Not at a stage to formulate and implement the policies',
  no_resources: 'No financial, human or technical resources available',
  planned_next_fy: 'Planned for the next financial year',
  other: 'Other reason',
};

export const isPolicyMatrix = (v) => (
  Boolean(v) && typeof v === 'object' && !Array.isArray(v) && 'mode' in v && ('principle_wise' in v || 'all_together' in v)
);

const yesNo = (v) => (v === true ? 'Yes' : v === false ? 'No' : '–');

const summarize = (d = {}) => {
  if (d.covered === true) return { covered: 'Yes', details: [`Board approved: ${yesNo(d.board_approved)}`, ...(d.web_link ? [`Link: ${d.web_link}`] : [])] };
  if (d.covered === false) {
    const reasons = Object.entries(d.reasons || {}).filter(([, on]) => on).map(([key, on]) => (
      key === 'other' && typeof on === 'string' ? `${REASONS.other}: ${on}` : (REASONS[key] || key)));
    return { covered: 'No', details: reasons.length ? reasons : ['No reason given'] };
  }
  return { covered: '–', details: [] };
};

const rowsOf = (value) => {
  const together = (value?.mode || 'together') === 'together';
  if (together) return [['All', 'All principles together', summarize(value?.all_together)]];
  return PRINCIPLES.map(([key, name]) => [key, name, summarize(value?.principle_wise?.[key])]);
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const modeLabel = (v) => ((v?.mode || 'together') === 'together' ? 'All principles together' : 'Principle-wise');

const Row = ({ id, name, now, was }) => (
  <tr className={`border-t border-stone-200 align-top ${was ? 'bg-amber-50/60' : ''}`} data-testid={`policy-matrix-row-${id}`}>
    <td className="py-1.5 pr-3 font-medium text-violet-700 whitespace-nowrap">{id}<span className="block text-[11px] font-normal text-stone-500">{name}</span></td>
    <td className="py-1.5 pr-3 whitespace-nowrap">
      {was && <span className="text-stone-400 line-through mr-1">{was.covered}</span>}{now.covered}
    </td>
    <td className="py-1.5 text-xs text-stone-700">
      {now.details.length ? <ul className="list-disc pl-4">{now.details.map((t) => <li key={t} className="break-words">{t}</li>)}</ul> : '–'}
      {was && <p className="mt-1 text-stone-500">Was: {was.covered}{was.details.length ? ` – ${was.details.join('; ')}` : ''}</p>}
    </td>
  </tr>
);

export default function PolicyMatrixValue({ value, compareTo }) {
  const comparing = isPolicyMatrix(compareTo);
  const modeChanged = comparing && modeLabel(compareTo) !== modeLabel(value);
  const rows = rowsOf(value);
  const oldRows = comparing ? new Map(rowsOf(compareTo).map(([id, , s]) => [id, s])) : null;
  const shown = comparing && !modeChanged ? rows.filter(([id, , s]) => !same(s, oldRows.get(id))) : rows;

  if (comparing && !modeChanged && shown.length === 0) {
    return <p className="text-sm text-stone-500" data-testid="policy-matrix-no-change">No change to the policy matrix.</p>;
  }
  return (
    <div className="text-sm" data-testid="policy-matrix-value">
      <p className="mb-2 text-xs text-stone-500">Mode: <strong className="text-stone-700">{modeLabel(value)}</strong>{modeChanged && <span> (was {modeLabel(compareTo)})</span>}</p>
      <table className="w-full">
        <thead><tr className="text-left text-[11px] uppercase tracking-wide text-stone-400"><th className="pb-1 pr-3">Principle</th><th className="pb-1 pr-3">Covered</th><th className="pb-1">Details</th></tr></thead>
        <tbody>
          {shown.map(([id, name, now]) => (
            <Row key={id} id={id} name={name} now={now} was={comparing && !modeChanged ? oldRows.get(id) : null} />
          ))}
        </tbody>
      </table>
      {comparing && !modeChanged && <p className="mt-2 text-[11px] text-stone-400">Showing only the principles that changed.</p>}
    </div>
  );
}

export const applyCoverageField = (entry = {}, field, val) => {
  const next = { ...entry, [field]: val };
  if (field === 'covered' && val === true) delete next.reasons;
  if (field === 'covered' && val === false) { delete next.board_approved; delete next.web_link; }
  return next;
};
