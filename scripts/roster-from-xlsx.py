"""Turns Gurukul's master database workbook into the roster CSV the loader reads.

Usage: python scripts/roster-from-xlsx.py "C:\\path\\Gurukul Data base.xlsx"
Writes registers/roster/roster.csv (git-ignored: it holds children's personal data).

The workbook's columns are: Name | WhatsApp phone | Date of birth | Gender | Center | Batch |
Timings | Parent name | Parent phone | Monthly fees | Fees pending date. Tabs may mix centres,
so the Center column decides, not the tab name.
"""
import csv
import datetime
import re
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "registers" / "roster" / "roster.csv"

CENTRES = {
    "bal bharati": "Bal Bharati School",
    "opg": "OPG World School",
    "nk bagrodia": "NK Bagrodia Public School",
    "play yard": "Play Yard Arena",
    "rd rajpal": "R.D. Rajpal School",
    "r.d. rajpal": "R.D. Rajpal School",
}
BATCHES = {"junior": "Junior 5-6pm", "senior": "Senior 6-7pm", "elite": "Elite 7-8pm", "morning": "Morning 6:30-7:30am"}


def norm(v) -> str:
    return re.sub(r"\s+", " ", str(v or "")).strip()


def phone(v) -> str:
    """10-digit Indian mobile → E.164. Excel stores these as floats, hence the .0 strip."""
    d = re.sub(r"\D", "", norm(v).removesuffix(".0"))
    d = d[-10:] if len(d) > 10 else d
    return f"+91{d}" if len(d) == 10 and d[0] in "6789" else ""


def dob(v) -> tuple[str, str]:
    """Returns (ISO date, note). Blank when the value can't be trusted."""
    if isinstance(v, (datetime.datetime, datetime.date)):
        d = v.date() if isinstance(v, datetime.datetime) else v
    else:
        m = re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$", norm(v))
        if not m:
            return "", f"unreadable date of birth ({norm(v)})"
        day, month, year = int(m[1]), int(m[2]), int(m[3])
        if year > datetime.date.today().year:  # e.g. 2107 typed for 2017
            year -= 100
        try:
            d = datetime.date(year, month, day)
        except ValueError:
            return "", f"impossible date of birth ({norm(v)})"
    if not (2000 <= d.year <= datetime.date.today().year):
        return "", f"date of birth out of range ({d.isoformat()})"
    return d.isoformat(), ""


def lookup(table: dict[str, str], value: str) -> str:
    v = value.lower()
    for key, mapped in table.items():
        if v.startswith(key) or key in v:
            return mapped
    return ""


def main(src: str) -> None:
    wb = openpyxl.load_workbook(src, data_only=True)
    rows, problems = [], []
    for ws in wb:
        for i, r in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
            name = norm(r[0])
            if not name:
                continue
            where = f"{ws.title} row {i} ({name})"
            centre = lookup(CENTRES, norm(r[4]))
            batch = lookup(BATCHES, norm(r[5]))
            if not centre or not batch:
                problems.append(f"{where}: unknown centre/batch — {norm(r[4])} / {norm(r[5])}")
                continue
            birth, note = dob(r[2])
            if note:
                problems.append(f"{where}: {note}")
            parent_phone = phone(r[8]) or phone(r[1])
            if not parent_phone:
                problems.append(f"{where}: no usable phone number")
            fee = re.sub(r"\D", "", norm(r[9]).removesuffix(".0"))
            rows.append({
                "name": name, "parent_name": norm(r[7]), "parent_phone": parent_phone,
                "dob": birth, "gender": norm(r[3]), "centre": centre, "batch": batch,
                "monthly_fee": fee,
            })
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    print(f"{len(rows)} students → {OUT}")
    by_centre: dict[str, int] = {}
    for r in rows:
        by_centre[r["centre"]] = by_centre.get(r["centre"], 0) + 1
    for centre, n in sorted(by_centre.items()):
        print(f"  {centre}: {n}")
    if problems:
        print(f"\n{len(problems)} row(s) need Sharan's attention:")
        for p in problems:
            print("  -", p)


if __name__ == "__main__":
    main(sys.argv[1])
