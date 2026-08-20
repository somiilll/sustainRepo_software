import pytest

from modules.internal_data_ai.services import history


class _Cursor:
    def __init__(self, rows):
        self.rows = rows

    def sort(self, *_args):
        return self

    async def to_list(self, _length):
        return self.rows


class _HistoryCollection:
    def find(self, _query, _projection):
        return _Cursor([{
            "emission_id": "record-1",
            "changed_at": "2026-08-12T06:39:31Z",
            "changed_by": "internal-user-id",
            "changed_by_name": "Somil",
            "changes": {"action": "updated"},
        }])


class _DB:
    emission_history = _HistoryCollection()


@pytest.mark.asyncio
async def test_record_history_keeps_stored_display_name_and_omits_internal_user_id(monkeypatch):
    monkeypatch.setattr(history, "db", _DB())

    result = await history.get_emission_record_history(
        "org-a", emission_records=[{"id": "record-1"}]
    )

    assert result == {
        "total": 1,
        "history": [{
            "changed_at": "2026-08-12T06:39:31Z",
            "changes": {"action": "updated"},
            "changed_by_name": "Somil",
        }],
    }