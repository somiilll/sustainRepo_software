import ast
from pathlib import Path


ROUTER_PATH = Path(__file__).parents[1] / "modules" / "supplier_assessment" / "router.py"


def test_supplier_create_writes_canonical_emission_history():
    source = ROUTER_PATH.read_text()
    tree = ast.parse(source)
    create_function = next(
        node
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        and node.name == "create_my_emission"
    )
    function_source = ast.get_source_segment(source, create_function)

    assert "db.emission_records.insert_one(emission_record)" in function_source
    assert "db.emission_history.insert_one" in function_source
    assert '"emission_id": emission_id' in function_source
    assert '"action": "created"' in function_source
    assert 'if key != "_id"' in function_source