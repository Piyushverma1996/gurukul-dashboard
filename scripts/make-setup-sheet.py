"""Regenerates Sharan's setup workbook (registers/setup/, git-ignored). Run: python scripts/make-setup-sheet.py (needs openpyxl)."""
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation

NAVY, GOLD, CREAM, GREY = "0D1F4B", "C9A227", "FFF8E1", "F2F4F8"
OUT = Path(__file__).resolve().parents[1] / "registers" / "setup" / "Gurukul-Setup-Sheet.xlsx"

CENTRES = [
    ("NK Bagrodia Public School", "Sector 4"),
    ("Play Yard", "Sector 7"),
    ("R.D. Rajpal School", "Sector 9"),
    ("Bal Bharati Public School", "Sector 12"),
    ("OPG World School", "Sector 19B"),
]
AGES = ["U8", "U10", "U12", "U14", "U16", "U19", "SENIOR"]

thin = Side(style="thin", color="D0D5DD")
box = Border(left=thin, right=thin, top=thin, bottom=thin)
wrap = Alignment(wrap_text=True, vertical="top")


def sheet(wb, title, intro, headers, widths, rows=(), blank=15, first=False):
    ws = wb.active if first else wb.create_sheet(title)
    ws.title = title
    ws["A1"] = title
    ws["A1"].font = Font(bold=True, size=16, color=NAVY)
    ws["A2"] = intro
    ws["A2"].font = Font(italic=True, color="555555")
    ws["A2"].alignment = Alignment(wrap_text=True, vertical="top")
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=max(len(headers), 1))
    ws.row_dimensions[2].height = 48
    for i, (h, w) in enumerate(zip(headers, widths), start=1):
        c = ws.cell(row=4, column=i, value=h)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor=NAVY)
        c.alignment = Alignment(wrap_text=True, vertical="center")
        c.border = box
        ws.column_dimensions[c.column_letter].width = w
    ws.row_dimensions[4].height = 34
    ws.freeze_panes = "B5"
    total = len(rows) + blank
    for r in range(total):
        vals = rows[r] if r < len(rows) else [""] * len(headers)
        for ci, v in enumerate(vals, start=1):
            c = ws.cell(row=5 + r, column=ci, value=v)
            c.border = box
            c.alignment = wrap
            if r < len(rows):
                c.fill = PatternFill("solid", fgColor=CREAM)
        ws.row_dimensions[5 + r].height = 22
    return ws, 5, 4 + total


def dropdown(ws, col, first, last, options, prompt):
    dv = DataValidation(type="list", formula1='"' + ",".join(options) + '"', allow_blank=True)
    dv.promptTitle, dv.prompt = "Pick one", prompt
    dv.showInputMessage = True
    ws.add_data_validation(dv)
    dv.add(f"{col}{first}:{col}{last}")


wb = Workbook()

# 1. Start here
ws = wb.active
ws.title = "Start here"
lines = [
    ("Gurukul FC — Dashboard setup sheet", Font(bold=True, size=18, color=NAVY)),
    ("For Sharan. Takes about 20–30 minutes. Fill it on the phone in Google Sheets or on a laptop.", Font(italic=True, color="555555")),
    ("", None),
    ("How to fill", Font(bold=True, size=13, color=NAVY)),
    ("1. Go through the tabs at the bottom in order: Centres → Batches → Coaches → Fees → Past dues & advance.", None),
    ("2. Cream-coloured rows are already filled in from the OPG register. Correct anything that's wrong.", None),
    ("3. Use the dropdowns where they appear. Leave a cell blank if you don't know.", None),
    ("4. When done, send the file back to Piyush. We'll load it into the app.", None),
    ("", None),
    ("Students are NOT filled in here", Font(bold=True, size=13, color=NAVY)),
    ("Once the batches are in the app, a Google Sheet with one tab per centre is created automatically.", None),
    ("Sharan types each child there (name, batch, parent name, WhatsApp, date of birth). The app picks it up within 10 minutes.", None),
    ("", None),
    ("Privacy", Font(bold=True, size=13, color=NAVY)),
    ("This file has coach phone numbers. Share it only with Piyush, directly, not in group chats.", None),
]
for i, (text, font) in enumerate(lines, start=1):
    c = ws.cell(row=i, column=1, value=text)
    if font:
        c.font = font
    c.alignment = Alignment(wrap_text=True, vertical="top")
ws.column_dimensions["A"].width = 110

# 2. Centres
ws, f, l = sheet(
    wb, "Centres",
    "One row per ground. The Google Maps pin is used later for coach check-in: open Google Maps at the ground, long-press the exact spot, tap Share, copy the link and paste it here.",
    ["Centre name (correct if wrong)", "Area / sector", "Google Maps pin link", "Usual training days", "Anything else"],
    [30, 14, 42, 22, 30],
    rows=[[n, s, "", "Mon, Wed, Fri" if n.startswith("OPG") else "", ""] for n, s in CENTRES],
    blank=2,
)

# 3. Batches
opg = "OPG World School"
ws, f, l = sheet(
    wb, "Batches",
    "One row per batch, per centre. Name it by level and time, e.g. \"Junior 4-5pm\". The OPG rows were guessed from the register, so please check the timings and age groups.",
    ["Centre", "Batch name", "Training days", "Start time", "End time", "Age group", "Head coach", "Assistant coach", "Monthly fee if different from the centre fee (₹)"],
    [26, 18, 20, 11, 11, 11, 18, 18, 22],
    rows=[
        [opg, "Junior 4-5pm", "Mon, Wed, Fri", "4:00 pm", "5:00 pm", "U10", "", "", ""],
        [opg, "Senior 5-6pm", "Mon, Wed, Fri", "5:00 pm", "6:00 pm", "U14", "", "", ""],
        [opg, "Senior 6-7pm", "Mon, Wed, Fri", "6:00 pm", "7:00 pm", "U16", "", "", ""],
    ],
    blank=22,
)
dropdown(ws, "A", f, l, [n for n, _ in CENTRES], "Which centre is this batch at?")
dropdown(ws, "F", f, l, AGES, "Age group of this batch")

# 4. Coaches
ws, f, l = sheet(
    wb, "Coaches",
    "Each coach logs in with their WhatsApp number and a temporary password that the app gives them. The Gmail address is optional and only needed for the \"Sign in with Google\" button.",
    ["Coach name", "WhatsApp number", "Role", "Gmail (optional)", "Centres / batches they coach", "Notes"],
    [22, 18, 16, 28, 34, 24],
    blank=12,
)
dropdown(ws, "C", f, l, ["Head coach", "Assistant coach"], "Head coaches can mark days off; assistants can't")

# 5. Fees
ws, f, l = sheet(
    wb, "Fees",
    "Fee rules. Answer in the right-hand column. The first five rows are each centre's standard monthly fee.",
    ["Question", "Answer", "Example / notes"],
    [52, 26, 50],
    rows=[[f"Monthly fee at {n} (₹)", "", "e.g. 2000"] for n, _ in CENTRES] + [
        ["Does the fee differ by batch or age group?", "", "If yes, put the amount in the Batches tab"],
        ["Fee due on which day of the month?", "1", "1 = due on the 1st of every month"],
        ["Days of grace before a fee counts as overdue", "7", "Shown in red after this"],
        ["Sibling discount?", "", "e.g. 10% off for the 2nd child, or ₹500 off"],
        ["Any other standard discount?", "", "e.g. staff children, scholarship"],
        ["One-time registration / admission fee (₹)", "", "Leave blank if none"],
        ["Kit fee (₹)", "", "Leave blank if none"],
        ["Paytm / UPI ID shown in fee reminders", "", "e.g. gurukulfc@paytm"],
        ["Fee reminder language", "", "English, Hindi or both"],
        ["Can a child join mid-month at a reduced fee?", "", "Yes = charge only for the days left"],
    ],
    blank=0,
)
dropdown(ws, "B", f + 5, f + 5, ["Yes", "No"], "")
dropdown(ws, "B", f + 13, f + 13, ["English", "Hindi", "Both"], "")
dropdown(ws, "B", f + 14, f + 14, ["Yes", "No"], "")

# 6. Past dues & advance
ws, f, l = sheet(
    wb, "Past dues & advance",
    "Only list the exceptions: children who still owe money for months BEFORE September 2026, or who have paid ahead. Everyone else can be left out. (September payments are recorded in the app; OPG's are already in from the register.)",
    ["Student name", "Centre", "Batch", "Owes for which months?", "Amount owed (₹)", "Paid in advance up to (month)", "Notes"],
    [22, 24, 16, 22, 14, 22, 26],
    blank=25,
)
dropdown(ws, "B", f, l, [n for n, _ in CENTRES], "")

for w in wb.worksheets:
    w.sheet_properties.tabColor = GOLD if w.title == "Start here" else NAVY

OUT.parent.mkdir(parents=True, exist_ok=True)
wb.save(OUT)
print("saved", OUT)
