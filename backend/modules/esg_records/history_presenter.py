"""Turns raw ESG-record snapshot diffs into user-facing history entries that match what the data-entry screen shows."""
from typing import Any

FIELD_VALUES_PREFIX = "field_values."
ROW_SEPARATOR = " › "


def _is_blank(value: Any) -> bool:
    return value is None or value == "" or value == []


def _has_rows(value: Any) -> bool:
    return isinstance(value, list) and any(isinstance(row, dict) and any(not _is_blank(v) for v in row.values()) for row in value)


def _field_key(path: str) -> str:
    stripped = path.removeprefix(FIELD_VALUES_PREFIX)
    return stripped.split(".")[0]


class FieldHistoryPresenter:
    """Presents diffs using schema labels/groups, hides system-derived legacy fields, and expands tables to cell level."""

    def __init__(self, category_fields: list[dict[str, Any]]):
        self._fields = {f["field_key"]: f for f in category_fields if f.get("field_key")}

    def present(
        self, diffs: list[dict[str, Any]], previous_values: dict[str, Any] | None, current_values: dict[str, Any] | None
    ) -> list[dict[str, Any]]:
        previous_values, current_values = previous_values or {}, current_values or {}
        presented: list[dict[str, Any]] = []
        for diff in diffs:
            key = _field_key(diff["field"])
            field = self._fields.get(key)
            if field is None:
                presented.append(diff)
            elif self._is_derived_legacy(field, previous_values, current_values):
                continue
            elif field.get("type") == "table" and (isinstance(diff.get("old_value"), list) or isinstance(diff.get("new_value"), list)):
                presented.extend(self._table_cell_diffs(field, diff))
            else:
                presented.append({**diff, "display_name": self._scalar_label(field)})
        return presented

    @staticmethod
    def _is_derived_legacy(field: dict[str, Any], previous_values: dict[str, Any], current_values: dict[str, Any]) -> bool:
        table_key = field.get("hide_if_table_has_rows")
        return bool(table_key) and (_has_rows(current_values.get(table_key)) or _has_rows(previous_values.get(table_key)))

    def _scalar_label(self, field: dict[str, Any]) -> str:
        label = field.get("label") or field["field_key"].replace("_", " ").title()
        parent = self._fields.get(field.get("parent_key") or "")
        context = field.get("group") or (parent.get("label") if parent and not field.get("group") else None)
        return f"{context}{ROW_SEPARATOR}{label}" if context else label

    def _table_cell_diffs(self, field: dict[str, Any], diff: dict[str, Any]) -> list[dict[str, Any]]:
        columns = field.get("table_columns") or []
        if not columns:
            return [{**diff, "display_name": field.get("label") or diff["display_name"]}]
        old_rows = [r for r in (diff.get("old_value") or []) if isinstance(r, dict)]
        new_rows = [r for r in (diff.get("new_value") or []) if isinstance(r, dict)]
        id_column = columns[0]["key"]
        use_identity = all(
            all(not _is_blank(r.get(id_column)) for r in rows) and len({r.get(id_column) for r in rows}) == len(rows)
            for rows in (old_rows, new_rows)
        )
        old_by_id = {self._row_id(r, i, id_column, use_identity): r for i, r in enumerate(old_rows)}
        new_by_id = {self._row_id(r, i, id_column, use_identity): r for i, r in enumerate(new_rows)}
        cells: list[dict[str, Any]] = []
        for row_id in list(dict.fromkeys([*old_by_id, *new_by_id])):
            old_row, new_row = old_by_id.get(row_id, {}), new_by_id.get(row_id, {})
            for column in columns[1:] if use_identity else columns:
                old_cell, new_cell = old_row.get(column["key"]), new_row.get(column["key"])
                if old_cell == new_cell or (_is_blank(old_cell) and _is_blank(new_cell)):
                    continue
                cells.append({
                    "field": f"{diff['field']}[{row_id}].{column['key']}",
                    "display_name": f"{row_id}{ROW_SEPARATOR}{column.get('label') or column['key']}",
                    "old_value": old_cell,
                    "new_value": new_cell,
                })
        return cells

    @staticmethod
    def _row_id(row: dict[str, Any], index: int, id_column: str, use_identity: bool) -> str:
        return str(row.get(id_column)) if use_identity else f"Row {index + 1}"
