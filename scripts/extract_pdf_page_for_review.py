"""Locate SBTi trajectory summary page and export PNG preview for manual review."""

from pathlib import Path

import pdfplumber


PDF_PATH = Path("/app/test_reports/iteration_155_mis_exec_2026_08.pdf")
OUT_DIR = Path("/app/test_reports/iteration_155_pdf_pages")
OUT_DIR.mkdir(parents=True, exist_ok=True)


def main() -> int:
    if not PDF_PATH.exists():
        print(f"PDF not found: {PDF_PATH}")
        return 1

    found = False
    with pdfplumber.open(str(PDF_PATH)) as pdf:
        for idx, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            if "SBTi Trajectory Summary" in text:
                found = True
                out_path = OUT_DIR / f"trajectory_page_{idx:02d}.png"
                page.to_image(resolution=160).save(str(out_path), format="PNG")
                print(f"Trajectory page found: {idx}")
                print(f"Saved: {out_path}")
                break

    if not found:
        print("Trajectory page not found")
        return 2

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
