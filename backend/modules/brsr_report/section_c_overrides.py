"""Python port of the UI table layout overrides (BRSRSectionC.js applyConfigOverrides) so the PDF mirrors the app."""
from typing import Any, Dict, List

UNIT_KL = {'default_unit': 'kl'}


def _rows_with_headers(config: Dict[str, Any], headers: Dict[str, List[str]], renames: Dict[str, str] = None) -> Dict[str, Any]:
    renames = renames or {}
    rows = []
    for row in config['table_config']['fixed_rows']:
        rows += [{'key': f"{row['key']}_sub_header_{i}", 'label': label, 'sub_header': True} for i, label in enumerate(headers.get(row['key'], []))]
        rows.append({**row, 'label': renames.get(row['key'], row['label'])})
    return {**config, 'table_config': {**config['table_config'], 'fixed_rows': rows}}


def _strip_source(config: Dict[str, Any], suffix: str) -> Dict[str, str]:
    return {r['key']: r['label'][: -len(suffix)] for r in config['table_config']['fixed_rows'] if r['label'].endswith(suffix)}


def _with_table(config: Dict[str, Any], **changes) -> Dict[str, Any]:
    return {**config, 'table_config': {**config['table_config'], **changes}}


def _fy_group(label: str, prefix: str, letters: str, middle: List[tuple]) -> Dict[str, Any]:
    subs = [{'label': f'Total ({letters[0]})', 'span_rows': True, 'columns': [{'key': f'{prefix}_total', 'label': ''}]}]
    for index, (title, key) in enumerate(middle, 1):
        letter = letters[index]
        subs.append({'label': title, 'columns': [{'key': f'{prefix}_{key}_no', 'label': f'No. ({letter})'}, {'key': f'{prefix}_{key}_pct', 'label': f'% ({letter}/{letters[0]})'}]})
    return {'label': label, 'sub_groups': subs}


def _person_rows(who: str, p: str, leaf: List[tuple]) -> List[Dict[str, Any]]:
    return [{'key': f'{p}_header', 'label': who, 'section_header': True}] + [{'key': f'{p}_{k}', 'label': label, 'child': True} for k, label in leaf]


def _water_discharged(config):
    def block(p, title):
        return [{'key': f'{p}_sub_header', 'label': title, 'sub_header': True},
                {'key': f'{p}_no_treatment', 'label': 'No treatment', 'child': True, **UNIT_KL},
                {'key': f'{p}_with_treatment', 'label': 'With treatment – please specify level', 'child': True, **UNIT_KL}]
    rows = [{'key': 'discharge_sub_header', 'label': 'Water discharge by destination and level of treatment', 'sub_header': True}]
    for p, title in (('surface', '(i) To Surface water'), ('ground', '(ii) To Groundwater'), ('sea', '(iii) To Seawater'), ('third_party', '(iv) Sent to third-parties'), ('others', '(v) Others')):
        rows += block(p, title)
    rows.append({'key': 'total_discharged', 'label': 'Total water discharged', **UNIT_KL})
    return _with_table(config, fixed_rows=rows)


def _water_stress(config):
    by_key = {r['key']: r for r in config['table_config']['fixed_rows']}
    pick = lambda key, label=None: {**by_key.get(key, {'key': key, 'label': label or key}), 'label': label or by_key.get(key, {}).get('label', key)}

    def discharge(title, no, with_t):
        return [{'key': f'{no}_sub_header', 'label': title, 'sub_header': True}] + [{**pick(no, 'No treatment'), 'child': True, **UNIT_KL}, {**pick(with_t, 'With treatment – please specify level'), 'child': True, **UNIT_KL}]
    rows = [{'key': 'withdrawal_sub_header', 'label': 'Water withdrawal by source', 'sub_header': True},
            pick('surface_water', '(i) Surface water'), pick('groundwater', '(ii) Groundwater'), pick('third_party', '(iii) Third party water'),
            pick('seawater', '(iv) Seawater / desalinated water'), pick('others_withdrawal', '(v) Others'),
            pick('total_withdrawal'), pick('total_consumption'), pick('intensity_turnover'), pick('intensity_optional'),
            {'key': 'water_stress_discharge_sub_header', 'label': 'Water discharge by destination and level of treatment', 'sub_header': True}]
    for title, no, with_t in (('(i) To Surface water', 'discharge_surface_no', 'discharge_surface_with'), ('(ii) To Groundwater', 'discharge_ground_no', 'discharge_ground_with'),
                              ('(iii) To Seawater', 'discharge_sea_no', 'discharge_sea_with'), ('(iv) Sent to third-parties', 'discharge_third_no', 'discharge_third_with'),
                              ('(v) Others', 'discharge_others_no', 'discharge_others_with')):
        rows += discharge(title, no, with_t)
    rows.append(pick('total_discharged', 'Total water discharged'))
    return {**_with_table(config, fixed_rows=rows), 'water_stress_fields': [('area_name', 'Name of the area'), ('nature_of_operations', 'Nature of operations')]}


def apply_overrides(config: Dict[str, Any]) -> Dict[str, Any]:
    key = config.get('question_key')
    tc = config.get('table_config') or {}
    rows = tc.get('fixed_rows')
    if key == 'p6_energy_consumption' and rows:
        renames = {**_strip_source(config, ' - From renewable sources'), **_strip_source(config, ' - From non-renewable sources')}
        return _rows_with_headers(config, {'renew_electricity': ['From renewable sources'], 'nonrenew_electricity': ['From non-renewable sources']}, renames)
    if key == 'p6_water_disclosures' and rows:
        return _rows_with_headers(config, {'surface_water': ['Water withdrawal by source']})
    if key == 'p6_water_discharged' and rows:
        return _water_discharged(config)
    if key == 'p6_water_stress_areas' and rows:
        return _water_stress(config)
    if key == 'p6_waste_management_details' and rows:
        recovered = ['For each category of waste generated, total waste recovered through recycling, re-using or other recovery operations', 'Category of waste']
        disposed = ['For each category of waste generated, total waste disposed by nature of disposal method', 'Category of waste']
        return _rows_with_headers(config, {'plastic_waste': ['Total Waste generated'], 'recovered_recycled': recovered, 'disposed_incineration': disposed}, {
            'recovered_recycled': '(i) Recycled', 'recovered_reused': '(ii) Re-used', 'recovered_other': '(iii) Other recovery operations', 'recovered_total': 'Total',
            'disposed_incineration': '(i) Incineration', 'disposed_landfilling': '(ii) Landfilling', 'disposed_other': '(iii) Other disposal operations', 'disposed_total': 'Total'})
    if key == 'p5_hr_training' and tc:
        fixed = []
        for who, p in (('Employees', 'emp'), ('Workers', 'workers')):
            fixed += [{'key': f'{p}_header', 'label': who, 'section_header': True}, {'key': f'{p}_permanent', 'label': 'Permanent', 'child': True},
                      {'key': f'{p}_other', 'label': 'Other than permanent', 'child': True}, {'key': f'{p}_total', 'label': f'Total {who}', 'child': True}]
        relabel = lambda c: {**c, 'label': c['label'].replace('No. covered', 'No. of employees / workers covered')}
        return _with_table(config, fixed_rows=fixed, columns=[relabel(c) for c in tc.get('columns', [])],
                           column_groups=[{**g, 'columns': [relabel(c) for c in g['columns']]} for g in tc.get('column_groups', [])])
    if key == 'p5_minimum_wages' and tc:
        fixed = []
        for who, p in (('Employees', 'emp'), ('Workers', 'workers')):
            fixed += [{'key': f'{p}_header', 'label': who, 'section_header': True}, {'key': f'{p}_perm_header', 'label': 'Permanent', 'sub_header': True},
                      {'key': f'{p}_perm_male', 'label': 'Male', 'grandchild': True}, {'key': f'{p}_perm_female', 'label': 'Female', 'grandchild': True},
                      {'key': f'{p}_other_header', 'label': 'Other than Permanent', 'sub_header': True},
                      {'key': f'{p}_other_male', 'label': 'Male', 'grandchild': True}, {'key': f'{p}_other_female', 'label': 'Female', 'grandchild': True}]
        mid = lambda: [('Equal to Minimum Wage', 'equal'), ('More than Minimum Wage', 'more')]
        return _with_table(config, fixed_rows=fixed, column_groups=[_fy_group('FY _____ (Current Financial Year)', 'cur', 'ABC', mid()), _fy_group('FY _____ (Previous Financial Year)', 'prev', 'DEF', mid())])
    if key == 'p5_remuneration_details' and tc:
        cols = lambda g: [{'key': f'{g}_number', 'label': 'Number'}, {'key': f'{g}_median', 'label': 'Median remuneration/salary/wages'}]
        return _with_table(config, columns=cols('male') + cols('female'), column_groups=[{'label': 'Male', 'columns': cols('male')}, {'label': 'Female', 'columns': cols('female')}])
    if key == 'p3_parental_leave_return' and tc.get('columns'):
        pick = lambda prefix: [{**c, 'label': 'Retention rate' if c['key'].endswith('retention') else 'Return to work rate'} for c in tc['columns'] if c['key'].startswith(prefix)]
        emp, wrk = pick('perm_emp_'), pick('perm_workers_')
        return _with_table(config, columns=emp + wrk, column_groups=[{'label': 'Permanent Employees', 'columns': emp}, {'label': 'Permanent Workers', 'columns': wrk}])
    if key == 'p3_union_membership' and rows:
        fixed = []
        for who, p in (('Total Permanent Employees', 'perm_emp'), ('Total Permanent Workers', 'perm_workers')):
            fixed += [{'key': f'{p}_total', 'label': who, 'section_header': True}, {'key': f'{p}_male', 'label': 'Male', 'child': True}, {'key': f'{p}_female', 'label': 'Female', 'child': True}]
        return _with_table(config, fixed_rows=fixed)
    if key == 'p3_safety_incidents' and rows:
        def make(suffix):
            return [{'key': f'ltifr_{suffix}', 'label': 'Lost Time Injury Frequency Rate (LTIFR) (per one million-person hours worked)', 'child': True},
                    {'key': f'recordable_injuries_{suffix}', 'label': 'Total recordable work-related injuries', 'child': True},
                    {'key': f'fatalities_{suffix}', 'label': 'No. of fatalities', 'child': True},
                    {'key': f'high_consequence_{suffix}', 'label': 'High consequence work-related injury or ill-health (excl. fatalities)', 'child': True}]
        return _with_table(config, fixed_rows=[{'key': 'employees_header', 'label': 'Employees', 'section_header': True}] + make('employees')
                           + [{'key': 'workers_header', 'label': 'Workers', 'section_header': True}] + make('workers'))
    if key == 'p3_assessments_year' and tc:
        return _with_table(config, columns=[{'key': 'plants_offices_assessed', 'label': '% of your plants and offices that were assessed (by entity or statutory authorities or third parties)'}])
    if key in ('p3_training_details', 'performance_career_reviews') and rows:
        fixed = _person_rows('Employees', 'emp', [('male', 'Male'), ('female', 'Female'), ('total', 'Total')]) + _person_rows('Workers', 'workers', [('male', 'Male'), ('female', 'Female'), ('total', 'Total')])
        if key == 'performance_career_reviews':
            return _with_table(config, fixed_rows=fixed)
        mid = lambda: [('On Health and safety measures', 'hs'), ('On Skill upgradation', 'skill')]
        return _with_table(config, fixed_rows=fixed, column_groups=[_fy_group('FY _____ (Current Financial Year)', 'cur', 'ABC', mid()), _fy_group('FY _____ (Previous Financial Year)', 'prev', 'DEF', mid())])
    if key == 'p1_conflict_of_interest_complaints' and tc:
        cols = lambda p: [{'key': p, 'label': 'Number'}, {'key': f'{p}_remarks', 'label': 'Remarks'}]
        return _with_table(config, columns=cols('current_fy') + cols('previous_fy'),
                           column_groups=[{'label': 'Current Financial Year', 'columns': cols('current_fy')}, {'label': 'Previous Financial Year', 'columns': cols('previous_fy')}])
    if key == 'p1_training_awareness_coverage' and tc.get('columns'):
        labels = {'total': 'Total number of training and awareness programmes held', 'trained': 'Topics / principles covered under the training and its impact',
                  'pct': '%age of persons in respective category covered by the awareness programmes'}
        return _with_table(config, columns=[{**c, 'label': labels.get(c['key'], c['label'])} for c in tc['columns']])
    return config
