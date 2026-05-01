#!/usr/bin/env python3
"""
Birthday reminders for Wolfgang & Susanne via WhatsApp (German).

Uses the same Supabase project and outbound_messages queue as birthdays.py,
but reads from w_birthdays / w_birthday_reminders / w_birthday_acks.

WhatsApp numbers for Wolfgang and Susanne are read from env vars:
  WOLFGANG_NUMBER  e.g. +43...
  SUSANNE_NUMBER   e.g. +43...

Schedule (add to VPS crontab alongside birthdays.py):
  0 19 * * *  set -a; source /root/todo-list/scripts/.env; set +a; python3 /root/todo-list/scripts/birthdays_wolfgang.py evening >> /var/log/birthdays_wolfgang.log 2>&1
  0  7 * * *  set -a; source /root/todo-list/scripts/.env; set +a; python3 /root/todo-list/scripts/birthdays_wolfgang.py daytime >> /var/log/birthdays_wolfgang.log 2>&1
  0 10 * * *  set -a; source /root/todo-list/scripts/.env; set +a; python3 /root/todo-list/scripts/birthdays_wolfgang.py daytime >> /var/log/birthdays_wolfgang.log 2>&1
  0 13 * * *  set -a; source /root/todo-list/scripts/.env; set +a; python3 /root/todo-list/scripts/birthdays_wolfgang.py daytime >> /var/log/birthdays_wolfgang.log 2>&1
  0 16 * * *  set -a; source /root/todo-list/scripts/.env; set +a; python3 /root/todo-list/scripts/birthdays_wolfgang.py daytime >> /var/log/birthdays_wolfgang.log 2>&1
"""

import os
import sys
from datetime import date, timedelta

from supabase import create_client

SUPABASE_URL         = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

NUMBERS = {
    "Wolfgang": os.environ.get("WOLFGANG_NUMBER"),
    "Susanne":  os.environ.get("SUSANNE_NUMBER"),
}


def send_whatsapp(supa, number, message):
    supa.table("outbound_messages").insert({
        "to_number": number,
        "message":   message,
    }).execute()


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "daytime"
    supa = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    today    = date.today()
    tomorrow = today + timedelta(days=1)

    today_mmdd    = today.strftime("%m-%d")
    tomorrow_mmdd = tomorrow.strftime("%m-%d")

    if mode == "evening":
        resp = supa.table("w_birthdays").select("id, name").eq("birth_date", tomorrow_mmdd).execute()
        birthdays = resp.data or []

        for bday in birthdays:
            rem = supa.table("w_birthday_reminders").select("person_name").eq("birthday_id", bday["id"]).execute()
            recipients = [r["person_name"] for r in (rem.data or [])]

            for person in recipients:
                number = NUMBERS.get(person)
                if not number:
                    print(f"  Keine WhatsApp-Nummer für {person} — übersprungen.")
                    continue
                msg = f"Morgen hat {bday['name']} Geburtstag! 🎂 Vergiss nicht zu gratulieren!"
                send_whatsapp(supa, number, msg)
                print(f"  Abend-Erinnerung → {person} für {bday['name']}s Geburtstag morgen.")

    else:
        resp = supa.table("w_birthdays").select("id, name").eq("birth_date", today_mmdd).execute()
        birthdays = resp.data or []

        for bday in birthdays:
            rem = supa.table("w_birthday_reminders").select("person_name").eq("birthday_id", bday["id"]).execute()
            recipients = [r["person_name"] for r in (rem.data or [])]

            acks = supa.table("w_birthday_acks").select("acked_by").eq("birthday_id", bday["id"]).eq("ack_date", today.isoformat()).execute()
            acked_by = {r["acked_by"] for r in (acks.data or [])}

            for person in recipients:
                if person in acked_by:
                    print(f"  {person} hat {bday['name']}s Geburtstag bereits bestätigt — übersprungen.")
                    continue
                number = NUMBERS.get(person)
                if not number:
                    print(f"  Keine WhatsApp-Nummer für {person} — übersprungen.")
                    continue
                msg = f"Heute hat {bday['name']} Geburtstag! 🎂 Schon gratuliert? Bestätige in der App."
                send_whatsapp(supa, number, msg)
                print(f"  Tagsüber-Erinnerung → {person} für {bday['name']}s Geburtstag heute.")

    print("Fertig.")


if __name__ == "__main__":
    main()
