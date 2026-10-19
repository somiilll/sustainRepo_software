"""Small, side-effect-free helpers for Markdown response rendering."""


def format_list_of_dicts_as_table(items: list[dict]) -> str:
    """Format a list of dictionaries as a Markdown table."""
    if not items or not isinstance(items[0], dict):
        return ""

    headers = list(items[0].keys())
    for item in items[1:]:
        for key in item:
            if key not in headers:
                headers.append(key)

    labels = [header.replace("_", " ").title() for header in headers]
    lines = ["| " + " | ".join(labels) + " |"]
    lines.append("| " + " | ".join("---" for _ in headers) + " |")

    for item in items[:20]:
        cells = []
        for header in headers:
            value = item.get(header)
            if value is None or value == "":
                cells.append("-")
            elif isinstance(value, bool):
                cells.append("Yes" if value else "No")
            elif isinstance(value, (dict, list)):
                cells.append(str(value)[:60])
            else:
                cells.append(str(value))
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines)


def format_markdown_cell(value) -> str:
    """Render a compact, safe scalar for a Markdown table cell."""
    if value in (None, "", [], {}):
        return "-"
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, list):
        value = ", ".join(str(item) for item in value if item not in (None, ""))
    return str(value).replace("|", "\\|").replace("\n", " ").strip() or "-"