#!/usr/bin/env python3
"""
create_quarterly_todos.py
Creates quarterly reminder todos in Supabase for tasks that need to happen
at the start of each quarter. Currently: OeNB 87Q AIF reporting.

Runs on 1 Jan, 1 Apr, 1 Jul, 1 Oct via GitHub Actions.
"""

import os
from datetime import date, datetime, timezone

from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

ASTRID_ID = "f4136b84-bb12-4a96-a197-2f25774597b2"

# Quarter end dates by month the cron fires
QUARTER_ENDS = {
    1:  "31.12",   # fires 1 Jan  → Q4 just ended
    4:  "31.03",   # fires 1 Apr  → Q1 just ended
    7:  "30.06",   # fires 1 Jul  → Q2 just ended
    10: "30.09",   # fires 1 Oct  → Q3 just ended
}


def main():
    supa = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    today = date.today()
    month = today.month
    year = today.year

    quarter_end = QUARTER_ENDS.get(month)
    if not quarter_end:
        print(f"Month {month} is not a quarter-start month — nothing to do.")
        return

    # Which quarter just ended?
    q_year = year - 1 if month == 1 else year
    q_labels = {1: "Q4", 4: "Q1", 7: "Q2", 10: "Q3"}
    q_label = q_labels[month]

    todos = [
        {
            "text": f"OeNB 87Q Meldung {q_label} {q_year} — Download IBKR Activity Statement (CSV) und script ausführen",
            "notes": f"Quartalsstichtag {quarter_end}.{q_year}. CSV von IBKR downloaden, in AIF Meldeformular Ordner ablegen, dann ibkr_oenb_87q.py ausführen. Pos. 1000000 / 1009000 / 1529000 ins OeNB Portal (myoenb.com) eingeben.",
        },
    ]

    now = datetime.now(timezone.utc).isoformat()
    created = 0
    for t in todos:
        supa.table("todos").insert({
            "text": t["text"],
            "notes": t["notes"],
            "created_by": ASTRID_ID,
            "assigned_to": ASTRID_ID,
            "assignment_status": "accepted",
            "status": "pending",
            "processed": 0,
            "created_at": now,
            "updated_at": now,
        }).execute()
        print(f"Created: {t['text']}")
        created += 1

    print(f"Done — {created} todo(s) created for {q_label} {q_year}.")


if __name__ == "__main__":
    main()
