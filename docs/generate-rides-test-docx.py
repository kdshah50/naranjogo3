#!/usr/bin/env python3
"""Generate docs/RIDES_FULL_MANUAL_TEST.docx from structured content."""
from __future__ import annotations

import re
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

DOC_DIR = Path(__file__).resolve().parent
MD_PATH = DOC_DIR / "RIDES_FULL_MANUAL_TEST.md"
OUT_PATH = DOC_DIR / "RIDES_FULL_MANUAL_TEST.docx"

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def p(text: str, bold: bool = False) -> str:
    t = escape(text)
    if bold:
        return f'<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">{t}</w:t></w:r></w:p>'
    return f'<w:p><w:r><w:t xml:space="preserve">{t}</w:t></w:r></w:p>'


def p_empty() -> str:
    return "<w:p/>"


def md_to_paragraphs(md: str) -> str:
    out: list[str] = []
    in_code = False
    for line in md.splitlines():
        if line.strip().startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            out.append(p(line, bold=False))
            continue
        if line.startswith("# "):
            out.append(p(line[2:].strip(), bold=True))
        elif line.startswith("## "):
            out.append(p_empty())
            out.append(p(line[3:].strip(), bold=True))
        elif line.startswith("### "):
            out.append(p(line[4:].strip(), bold=True))
        elif line.strip() == "---":
            out.append(p_empty())
        elif line.strip().startswith("|") and "---" not in line:
            out.append(p(line.strip()))
        elif line.strip().startswith("- [ ]"):
            out.append(p("☐ " + line.strip()[5:].strip()))
        elif line.strip().startswith("- "):
            out.append(p("• " + line.strip()[2:].strip()))
        elif re.match(r"^\d+\.", line.strip()):
            out.append(p(line.strip()))
        elif line.strip():
            out.append(p(line.strip()))
    return "".join(out)


def build_docx(body_xml: str) -> None:
    content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""
    rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""
    document = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="{W_NS}">
  <w:body>
    {body_xml}
    <w:sectPr/>
  </w:body>
</w:document>"""

    with zipfile.ZipFile(OUT_PATH, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types)
        zf.writestr("_rels/.rels", rels)
        zf.writestr("word/document.xml", document)


def main() -> None:
    md = MD_PATH.read_text(encoding="utf-8")
    body = md_to_paragraphs(md)
    build_docx(body)
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
