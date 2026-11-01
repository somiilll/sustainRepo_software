"""Config-driven HTML rendering of saved BRSR answers (tables, principle matrices, scalars) for Sections B and C."""
import html
import re
from typing import Any, Dict, List, Optional, Tuple

PRINCIPLES = [f"P{i}" for i in range(1, 10)]
LEADERSHIP_KEYS = {
    'p1_value_chain_awareness', 'p1_conflict_management_process', 'env_life_cycle_assessment', 'env_lca_concerns_actions', 'env_recycled_input_material',
    'env_reclaimed_products_packaging', 'p2_reclaimed_products_pct', 'p3_life_insurance_package', 'p3_value_chain_statutory_dues', 'p3_rehabilitation_injured',
    'transition_assistance_programs', 'p3_value_chain_assessment', 'p3_value_chain_corrective', 'p4_se_3', 'p4_se_4', 'p4_se_5',
    'p5_business_process_changes', 'p5_hr_due_diligence', 'p5_accessibility_differently_abled', 'p5_value_chain_hr_assessment', 'p5_value_chain_corrective',
    'p6_water_stress_areas', 'env_assurance_water_stress', 'p6_scope3_emissions', 'env_assurance_ghg_scope3', 'env_biodiversity_impact',
    'env_resource_efficiency_initiatives', 'env_business_continuity_disaster', 'env_value_chain_impacts', 'env_value_chain_assessment', 'public_policy_positions',
    'p8_sia_corrective_actions', 'p8_csr_aspirational_districts', 'p8_preferential_procurement', 'p8_marginalized_groups_procured', 'p8_marginalized_procurement_pct',
    'p8_intellectual_property_traditional', 'p8_ip_corrective_actions', 'p8_csr_beneficiaries', 'p9_product_info_channels', 'p9_consumer_education',
    'p9_service_disruption_mechanism', 'p9_product_info_beyond_legal', 'p9_consumer_satisfaction_survey',
}
CONTINUATION_KEYS = {
    'p3_wellbeing_workers', 'p3_wellbeing_spending', 'p3_hazard_identification', 'p3_worker_hazard_reporting', 'p3_non_occupational_healthcare',
    'p5_gross_wages_females', 'top_trade_associations', 'p8_marginalized_groups_procured', 'p8_marginalized_procurement_pct',
    'p9_data_breaches_pii_pct', 'p9_data_breaches_impact', 'p9_consumer_satisfaction_survey',
}
ASSURANCE_NOTE = 'Note: Indicate if any independent assessment/ evaluation/assurance has been carried out by an external agency? (Y/N) If yes, name of the external agency.'
QUESTION_RENAMES = {
    'p8_msme_domestic_sourcing': 'Percentage of input material (inputs to total inputs by value) sourced from suppliers:',
    'p6_water_stress_areas': 'Water withdrawal, consumption and discharge in areas of water stress',
    'p5_remuneration_details': 'Details of Median remuneration / wages',
    'p5_gross_wages_females': 'Gross wages paid to females as % of total wages paid by the entity',
    'p5_hr_complaints': 'Number of Complaints on the following made by employees and workers:',
}
WELLBEING_GROUPS = [('Health insurance', 'health_ins', 'B'), ('Accident insurance', 'accident_ins', 'C'), ('Maternity benefits', 'maternity', 'D'),
                    ('Paternity Benefits', 'paternity', 'E'), ('Day Care facilities', 'daycare', 'F')]


def is_unnumbered(key: str) -> bool:
    return key.startswith('env_assurance_') or key in CONTINUATION_KEYS


def esc(value: Any) -> str:
    return html.escape(str(value)).replace('\n', '<br>')


def _empty(value: Any) -> bool:
    if value is None or value == '' or value == [] or value == {}:
        return True
    if isinstance(value, dict):
        return all(_empty(v) for v in value.values())
    if isinstance(value, list):
        return all(_empty(v) for v in value)
    return False


def _scalar(value: Any) -> str:
    if isinstance(value, bool):
        return 'Yes' if value else 'No'
    if isinstance(value, float) and value.is_integer():
        return str(int(value)) if abs(value) >= 1000 else f'{value:g}'
    if isinstance(value, str) and value.lower() in ('yes', 'no'):
        return value.capitalize()
    return esc(value)


def _canon(key: str) -> str:
    key = re.sub(r'_(current|previous)_fy$', '', str(key))
    return re.sub(r'(^|_)wrk(_|$)', r'\1workers\2', key).replace('_', '')


def _pick(data: Any, key: str) -> Any:
    """Find a value by key, tolerating legacy spellings (wrk_/workers_, thirdparty/third_party) and an _current_fy suffix."""
    if not isinstance(data, dict):
        return None
    if key in data and not _empty(data[key]):
        return data[key]
    target = _canon(key)
    for name, value in data.items():
        if _canon(name) == target and not _empty(value):
            return value
    return data.get(key)


def _collect_labels(node: Any, labels: Dict[str, str]) -> None:
    if isinstance(node, dict):
        key, label = node.get('key') or node.get('name'), node.get('label')
        if isinstance(key, str) and isinstance(label, str):
            labels.setdefault(key, label)
        for child in node.values():
            _collect_labels(child, labels)
    elif isinstance(node, list):
        for child in node:
            _collect_labels(child, labels)


class AnswerRenderer:
    def __init__(self, reporting_period: str, previous_fy: str):
        self.current_fy, self.previous_fy = (re.sub(r'^FY\s*', '', str(v)) for v in (reporting_period, previous_fy))

    def _fy_fix(self, label: str) -> str:
        label = re.sub(r'FY\s*_{2,}\s*\(Current Financial Year\)', f'FY {self.current_fy} (Current Financial Year)', label)
        label = re.sub(r'FY\s*_{2,}\s*\(Previous Financial Year\)', f'FY {self.previous_fy} (Previous Financial Year)', label)
        return re.sub(r'FY\s*_{2,}\s*\(Year prior to Previous Financial Year\)', 'FY (Year prior to Previous Financial Year)', label)

    def _label(self, part: str, labels: Dict[str, str]) -> str:
        return self._fy_fix(self._label_raw(part, labels))

    def _label_raw(self, part: str, labels: Dict[str, str]) -> str:
        if part in labels:
            return labels[part]
        if part == 'current_fy':
            return f'FY {self.current_fy}'.replace('FY FY', 'FY')
        if part == 'previous_fy':
            return f'FY {self.previous_fy}'.replace('FY FY', 'FY')
        for suffix in ('_current_fy', '_previous_fy'):
            if part.endswith(suffix) and part[: -len(suffix)] in labels:
                return f'{labels[part[: -len(suffix)]]} ({self._label(suffix[1:], labels)})'
        return re.sub(r'\s+', ' ', part.replace('_', ' ').replace('.', ' ')).strip().title()

    def _path_label(self, path: Tuple[str, ...], labels: Dict[str, str]) -> str:
        joined = '_'.join(path)
        if joined in labels:
            return self._fy_fix(labels[joined])
        return ' - '.join(self._label(p, labels) for p in path)

    def _flatten(self, value: Any, prefix: Tuple[str, ...] = ()) -> Dict[Tuple[str, ...], Any]:
        if isinstance(value, dict):
            out: Dict[Tuple[str, ...], Any] = {}
            for key, child in value.items():
                out.update(self._flatten(child, prefix + (str(key),)))
            return out
        return {prefix: value}

    @staticmethod
    def _order(keys: List[str], labels: Dict[str, str]) -> List[str]:
        index = {k: i for i, k in enumerate(labels)}
        return sorted(keys, key=lambda k: (index.get(k.split('.')[0], index.get(re.sub(r'_(current|previous)_fy$', '', k), 10 ** 6)), keys.index(k)))

    def _table(self, header: List[str], rows: List[List[str]], first_col: str = '') -> str:
        head = ''.join(f'<th>{esc(h)}</th>' for h in [first_col] + header)
        body = ''.join('<tr>' + f'<td>{r[0]}</td>' + ''.join(f'<td class="text-center answer-cell">{c}</td>' for c in r[1:]) + '</tr>' for r in rows)
        return f'<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>'


    def _inline_yes_no(self, config: Dict[str, Any], value: Any) -> Optional[str]:
        if not isinstance(value, dict):
            return None
        if config.get('type') == 'dual_conditional_yes_no' or (value and all(isinstance(v, dict) and 'has_value' in v for v in value.values())):
            names = {c['key']: c['label'] for c in config.get('categories') or []}
            return ''.join(f'<p style="margin:3px 0">{esc(names.get(k) or self._label(k, {}))}: <b>{"Yes" if v.get("has_value") else "No"}</b></p>'
                           for k, v in value.items() if isinstance(v, dict) and 'has_value' in v)
        if 'answer' in value and all(not isinstance(v, (dict, list)) for v in value.values()):
            answer = _scalar(value['answer'])
            extra = [str(v) for k, v in value.items() if k != 'answer' and not _empty(v)]
            text = f'{answer}, {", ".join(extra)}' if answer == 'Yes' and extra else answer
            return f'<p style="margin:3px 0">{esc(text) if "&" not in text else text}</p>'
        return None

    def _principle_matrix(self, value: Dict[str, Any], labels: Dict[str, str]) -> str:
        per = value.get('principles') or value.get('principle_wise') or {}
        shared = value.get('all_together') or value.get('combined')
        if not shared:
            shared = {k[4:]: v for k, v in value.items() if k.startswith('all_') and not isinstance(v, dict)}
        together = value.get('mode') == 'together' or (_empty(per) and not _empty(shared))
        columns = {p: (shared if together else per.get(p)) for p in PRINCIPLES}
        columns = {p: (v if isinstance(v, dict) else {'answer': v}) for p, v in columns.items() if not _empty(v) or together}
        flat = {p: self._flatten(v) for p, v in columns.items()}
        paths = list(dict.fromkeys(path for f in flat.values() for path in f if not _empty(f[path])))
        if not paths:
            return ''
        is_link = lambda path: bool(re.search(r'web_?link|weblink', '_'.join(path), re.I))
        link_paths = [path for path in paths if is_link(path)]
        paths = [path for path in paths if not is_link(path)]
        rows = [[esc(self._path_label(path, labels))] + [_scalar(f.get(path)) if not _empty(f.get(path)) else '' for f in flat.values()] for path in paths]
        table = self._table(list(flat), rows, 'Disclosure') if rows else ''
        links = ''
        for path in link_paths:
            label = esc(self._path_label(path, labels))
            values = {p: f.get(path) for p, f in flat.items() if not _empty(f.get(path))}
            if together:
                first = next(iter(values.values()), '')
                links += f'<p style="margin:6px 0;word-break:break-all"><b>{label}:</b> {_scalar(first)}</p>'
            else:
                links += f'<p style="margin:6px 0 2px"><b>{label}</b></p>' + ''.join(
                    f'<p style="margin:2px 0 2px 12px;word-break:break-all">{esc(p)}: {_scalar(v)}</p>' for p, v in values.items())
        return table + links

    def _dict_of_dicts(self, value: Dict[str, Any], labels: Dict[str, str], config: Dict[str, Any]) -> str:
        table_config = config.get('table_config') or {}
        fixed_rows = table_config.get('fixed_rows') or []
        row_keys = [r['key'] for r in fixed_rows if r.get('key') in value] + [k for k in value if k not in {r.get('key') for r in fixed_rows}]
        flats = {rk: self._flatten(value[rk]) if isinstance(value[rk], dict) else {('value',): value[rk]} for rk in row_keys}
        col_paths = list(dict.fromkeys(p for f in flats.values() for p in f if not _empty(f[p])))
        col_keys = {p: '.'.join(p) for p in col_paths}
        ordered = self._order([col_keys[p] for p in col_paths], labels)
        col_paths = sorted(col_paths, key=lambda p: ordered.index(col_keys[p]))
        rows = [[esc(labels.get(rk) or self._label(rk, labels))] + [_scalar(flats[rk][p]) if not _empty(flats[rk].get(p)) else '' for p in col_paths] for rk in row_keys if not _empty(value[rk])]
        if not rows:
            return ''
        return self._table([self._path_label(p, labels) if p != ('value',) else 'Answer' for p in col_paths], rows)

    def _list_table(self, rows: List[Any], labels: Dict[str, str]) -> str:
        if all(not isinstance(r, dict) for r in rows):
            return esc(', '.join(str(r) for r in rows if not _empty(r)))
        flats = [self._flatten(r) if isinstance(r, dict) else {('value',): r} for r in rows if not _empty(r)]
        cols = list(dict.fromkeys(p for f in flats for p in f))
        body = [[_scalar(f.get(p)) if not _empty(f.get(p)) else '' for p in cols] for f in flats]
        return self._table([self._path_label(p, labels) for p in cols], [[str(i + 1)] + r for i, r in enumerate(body)], 'S. No.')

    def _mixed(self, value: Dict[str, Any], labels: Dict[str, str], config: Dict[str, Any]) -> str:
        scalars = {k: v for k, v in value.items() if not isinstance(v, (list, dict)) and not _empty(v)}
        nested = {k: v for k, v in value.items() if isinstance(v, (list, dict)) and not _empty(v)}
        out = ''
        if scalars:
            out += self._table(['Response'], [[esc(self._label(k, labels)), _scalar(v)] for k, v in scalars.items()], 'Field')
        for key, child in nested.items():
            sub = self.render(config, child, labels, heading=self._label(key, labels))
            out += sub
        return out


    def _cell(self, value: Any) -> str:
        if _empty(value):
            return ''
        if isinstance(value, (dict, list)):
            return esc(', '.join(f'{k}: {v}' for k, v in value.items()) if isinstance(value, dict) else ', '.join(str(v) for v in value))
        return _scalar(value)

    @staticmethod
    def _lookup(row: Any, key: str) -> Any:
        if not isinstance(row, dict):
            return None
        candidates = [(None, key), (None, f'{key}_current_fy'), (None, f'{key}_current')]
        for prefix, fy, plain in (('cur_', 'current_fy', True), ('prev_', 'previous_fy', False)):
            if key.startswith(prefix):
                base = key[len(prefix):]
                short = 'current' if fy == 'current_fy' else 'previous'
                candidates += [(fy, base), (None, f'{base}_{fy}'), (None, f'{short}_{base}'), (None, f'{prefix[:-1]}_{base}' if prefix != short + '_' else f'{short}_{base}')] + ([(None, base)] if plain else [])
        for fy, name in candidates:
            source = row.get(fy) if fy else row
            if isinstance(source, dict) and name in source and not _empty(source[name]):
                return source[name]
        return None

    def _fixed_grid(self, config: Dict[str, Any], value: Any) -> str:
        tc = config['table_config']
        data = value.get('rows') if isinstance(value, dict) and isinstance(value.get('rows'), dict) else (value if isinstance(value, dict) else {})
        groups = tc.get('column_groups') or []

        def leaf_sets(group):
            return group.get('sub_groups') or [{'label': None, 'columns': group.get('columns', [])}]
        columns = [c for g in groups for sub in leaf_sets(g) for c in sub['columns']] if groups else tc.get('columns') or []
        first = esc(tc.get('row_header') or config.get('row_header') or '')
        fy = lambda text: esc(self._fy_fix(text))
        if groups:
            depth = 3 if any(g.get('sub_groups') for g in groups) else 2
            rows_html = [[f'<th rowspan="{depth}">{first}</th>'], [], []]
            for g in groups:
                n = sum(len(sub['columns']) for sub in leaf_sets(g))
                if g.get('span_rows'):
                    rows_html[0].append(f'<th rowspan="{depth}">{fy(g["label"])}</th>')
                    continue
                rows_html[0].append(f'<th colspan="{n}">{fy(g["label"])}</th>')
                for sub in leaf_sets(g):
                    if g.get('sub_groups'):
                        no_leaf = all(not c.get('label') for c in sub['columns'])
                        rows_html[1].append(f'<th colspan="{len(sub["columns"])}"' + (' rowspan="2"' if no_leaf else '') + f'>{fy(sub["label"])}</th>')
                        if not no_leaf:
                            rows_html[2] += [f'<th>{fy(c["label"])}</th>' for c in sub['columns']]
                    else:
                        rows_html[1 if depth == 2 else 1] += [f'<th{" rowspan=2" if depth == 3 else ""}>{fy(c["label"])}</th>' for c in sub['columns']]
            head = ''.join(f'<tr>{"".join(r)}</tr>' for r in rows_html[:depth])
        else:
            head = '<tr>' + f'<th>{first}</th>' + ''.join(f'<th>{fy(c["label"])}</th>' for c in columns) + '</tr>'
        fixed = {_canon(r['key']) for r in tc['fixed_rows']}
        extras = {k: v for k, v in data.items() if _canon(k) not in fixed and not _empty(v)}
        attached: Dict[str, List[str]] = {}
        for row in tc['fixed_rows']:
            match = re.match(r'(.+?)_with(?:_treatment)?$', row['key'])
            if match:
                keys = [k for k in extras if k.startswith(match.group(1) + '_') and k not in attached.get('__all__', [])]
                attached[row['key']] = keys
                attached.setdefault('__all__', []).extend(keys)
        span = len(columns) + 1

        def data_row(label: str, raw: Any, indent: int = 0) -> str:
            cells = ''.join(f'<td class="text-center answer-cell">{self._cell(self._lookup(raw, c["key"]) if isinstance(raw, dict) else (raw if c is columns[0] else None))}</td>' for c in columns)
            pad = f' style="padding-left:{indent}px"' if indent else ''
            return f'<tr><td{pad}>{esc(label)}</td>{cells}</tr>'
        body = ''
        for row in tc['fixed_rows']:
            if row.get('section_header'):
                body += f'<tr class="category-header"><td colspan="{span}">{esc(row["label"])}</td></tr>'
                continue
            if row.get('sub_header'):
                body += f'<tr><td colspan="{span}"><b>{esc(row["label"])}</b></td></tr>'
                continue
            raw = _pick(data, row['key'])
            if row['key'] == 'others' and _empty(raw) and extras:
                continue
            indent = 28 if row.get('grandchild') else 14 if row.get('child') else 0
            body += data_row(row['label'], raw, indent)
            for extra in attached.get(row['key'], []):
                body += data_row(self._extra_label(extra, row['key']), extras[extra], indent + 14)
        used = set(attached.get('__all__', []))
        for key, raw in extras.items():
            if key not in used:
                body += data_row(self._extra_label(key), raw)
        return f'<table><thead>{head}</thead><tbody>{body}</tbody></table>'

    @staticmethod
    def _extra_label(key: str, parent: str = '') -> str:
        base = re.match(r'(.+?)_with(?:_treatment)?$', parent)
        if base and key.startswith(base.group(1) + '_'):
            key = key[len(base.group(1)) + 1:]
        key = re.sub(r'_[0-9a-f]{8}$', '', key)
        return re.sub(r'\s+', ' ', key.replace('_', ' ')).strip().capitalize()

    def _grouped_grid(self, config: Dict[str, Any], value: Any) -> str:
        tc = config['table_config']
        data = value.get('value') if isinstance(value, dict) and isinstance(value.get('value'), dict) else (value if isinstance(value, dict) else {})
        if isinstance(data.get('rows'), dict):
            data = data['rows']
        columns = tc.get('columns') or []
        head = '<tr><th>Parameter</th><th>Metrics</th>' + ''.join(f'<th>{esc(self._fy_fix(c["label"]))}</th>' for c in columns) + '</tr>'
        body = ''
        for group in tc.get('groups') or []:
            rows = group.get('rows') or []
            for i, row in enumerate(rows):
                raw = _pick(_pick(data, group['key']), row['key'])
                label = f'<td rowspan="{len(rows)}">{esc(group["label"])}</td>' if i == 0 else ''
                cells = ''.join(f'<td class="text-center answer-cell">{self._cell(self._lookup(raw, c["key"]) if isinstance(raw, dict) else None)}</td>' for c in columns)
                body += f'<tr>{label}<td>{esc(row["label"])}</td>{cells}</tr>'
        return f'<table><thead>{head}</thead><tbody>{body}</tbody></table>'

    def _list_grid(self, columns: List[Dict[str, Any]], rows: Any, min_rows: int = 1) -> str:
        rows = [r for r in (rows if isinstance(rows, list) else []) if not _empty(r)]
        head = '<tr><th class="col-sno">S. No.</th>' + ''.join(f'<th>{esc(self._fy_fix(c.get("label", c.get("key", ""))))}</th>' for c in columns) + '</tr>'
        body = ''.join(f'<tr><td class="text-center">{i + 1}</td>' + ''.join(f'<td class="answer-cell">{self._cell(r.get(c["key"]) if isinstance(r, dict) else None)}</td>' for c in columns) + '</tr>' for i, r in enumerate(rows))
        if not rows:
            body = ''.join('<tr><td class="text-center">&nbsp;</td>' + '<td class="answer-cell"></td>' * len(columns) + '</tr>' for _ in range(min_rows))
        return f'<table><thead>{head}</thead><tbody>{body}</tbody></table>'

    def _skeleton(self, config: Dict[str, Any], value: Any) -> Optional[str]:
        tc = config.get('table_config') or {}
        kind = config.get('type')
        if tc.get('fixed_rows') and (tc.get('columns') or tc.get('column_groups')) and all(('columns' in g or 'sub_groups' in g) for g in tc.get('column_groups') or []):
            grid = self._fixed_grid(config, value)
            fields = config.get('water_stress_fields')
            if fields:
                data = value if isinstance(value, dict) else {}
                intro = ''.join(f'<p style="margin:4px 0">({"i" * (i + 1)}) {esc(label)}: <b>{esc(data.get(k) or "")}</b></p>' for i, (k, label) in enumerate(fields))
                grid = intro + '<p style="margin:4px 0">(iii) Water withdrawal, consumption and discharge in the following format:</p>' + grid
            return grid
        if kind == 'grouped_matrix_table' and tc.get('groups'):
            return self._grouped_grid(config, value)
        if kind == 'multi_table' and config.get('tables_config'):
            data = value if isinstance(value, dict) else {}
            data = data.get('value') if isinstance(data.get('value'), dict) else data
            return ''.join(f'<div class="q-text"><b>{esc(t["label"])}</b></div>' + self._list_grid(t.get('columns') or [], data.get(t['key'])) for t in config['tables_config'])
        columns = config.get('table_columns') or tc.get('columns')
        if kind in ('table', 'dynamic_table') and columns:
            rows = value.get('rows') or value.get('value') if isinstance(value, dict) else value
            return self._list_grid(columns, rows)
        return None

    def render(self, config: Dict[str, Any], value: Any, labels: Optional[Dict[str, str]] = None, heading: str = '') -> str:
        if labels is None:
            labels = {}
            _collect_labels({k: v for k, v in config.items() if k not in ('question', 'description', 'answer_paths')}, labels)
        if not heading:
            grid = self._skeleton(config, value)
            if grid is not None:
                return grid
        if _empty(value):
            return '' if heading else '<div class="answer-value">&nbsp;</div>'
        if isinstance(value, dict) and set(value) == {'rows'} and isinstance(value['rows'], dict):
            value = value['rows']
        title = f'<div class="q-text"><b>{esc(heading)}</b></div>' if heading and heading != 'Rows' else ''
        inline_text = self._inline_yes_no(config, value) if not heading else None
        if inline_text is not None:
            return title + inline_text
        if isinstance(value, dict):
            if any(k in value for k in ('principles', 'principle_wise', 'all_together', 'combined')) or any(k.startswith('all_') for k in value):
                body = self._principle_matrix(value, labels)
            elif all(isinstance(v, dict) or _empty(v) for v in value.values()) and (config.get('table_config') or all(isinstance(v, dict) for v in value.values() if not _empty(v))):
                body = self._dict_of_dicts(value, labels, config)
            elif isinstance(value.get('rows'), list) and not any(k for k in value if k not in ('rows', 'answer')):
                answer = f'<p>{_scalar(value["answer"])}</p>' if not _empty(value.get('answer')) else ''
                body = answer + self._list_table(value['rows'], labels)
            else:
                body = self._mixed(value, labels, config)
        elif isinstance(value, list):
            body = self._list_table(value, labels)
        else:
            body = f'<div class="answer-cell">{_scalar(value)}</div>'
        return title + (body or '<div class="answer-value">&nbsp;</div>')


def wellbeing_override(config: Dict[str, Any]) -> Dict[str, Any]:
    key = config.get('question_key')
    if key not in ('p3_wellbeing_employees', 'p3_wellbeing_workers'):
        return config
    noun = 'employees' if key.endswith('employees') else 'workers'
    section = lambda k, label: {'key': k, 'label': label, 'section_header': True}
    child = lambda k, label: {'key': k, 'label': label, 'child': True}
    rows = [section('perm_header', f'Permanent {noun}'), child('perm_male', 'Male'), child('perm_female', 'Female'), child('perm_total', 'Total'),
            section('other_header', f'Other than Permanent {noun}'), child('other_male', 'Male'), child('other_female', 'Female'), child('other_total', 'Total')]
    groups = [{'label': 'Total (A)', 'span_rows': True, 'columns': [{'key': 'total_a', 'label': 'Total (A)'}]}] + [
        {'label': label, 'columns': [{'key': f'{k}_no', 'label': f'Number ({letter})'}, {'key': f'{k}_pct', 'label': f'% ({letter}/A)'}]}
        for label, k, letter in WELLBEING_GROUPS]
    return {**config, 'table_config': {**(config.get('table_config') or {}), 'fixed_rows': rows, 'column_groups': groups}}
