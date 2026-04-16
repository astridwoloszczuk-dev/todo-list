#!/usr/bin/env python3
"""Prioritise unprocessed todos via Claude, update Supabase, notify urgent tasks via ntfy."""

import json
import os
import re
import time
from datetime import datetime, timezone

import anthropic
import requests
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
NTFY_TOPIC = os.environ["NTFY_TOPIC"]

CATEGORIES = ["work", "personal", "health", "finance", "household", "social", "learning", "errands", "general"]

PRIORITY_RULES = """
Priority levels (use exactly these words):
- high     → genuine urgency, real deadline, health/safety, or meaningful consequence if missed
- medium   → should happen this week, no immediate crisis
- low      → nice to do, no real deadline
- someday  → aspirational, no timeline

Important: for tasks created by a CHILD, apply extra scepticism to urgency claims.
Children tend to label everything "URGENT". Buying ice cream, wanting a new game,
needing snacks — these are low or someday regardless of the language used.
Health appointments, school deadlines, and genuine responsibilities are still high.
"""


def main():
    supa = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    ai = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    # Fetch unprocessed pending todos, including creator's role
    resp = (
        supa.table("todos")
        .select("id, text, created_by, people!todos_created_by_fkey(role, name)")
        .eq("status", "pending")
        .eq("processed", 0)
        .execute()
    )
    todos = resp.data or []

    if not todos:
        print("No unprocessed todos — nothing to prioritise.")
        return

    print(f"Prioritising {len(todos)} tasks...")

    # Build todo list with creator context for Claude
    todo_lines = []
    for t in todos:
        creator = t.get("people") or {}
        role = creator.get("role", "parent")
        name = creator.get("name", "unknown")
        todo_lines.append(f'- id:{t["id"]} | created_by:{name} ({role}) | {t["text"]}')
    todo_list = "\n".join(todo_lines)

    prompt = (
        f"{PRIORITY_RULES}\n\n"
        f"Categories (pick one): {', '.join(CATEGORIES)}\n\n"
        f"Analyse these tasks and return a JSON array.\n"
        f"For each task include:\n"
        f"  id (integer, from the task)\n"
        f"  priority (one of: high, medium, low, someday)\n"
        f"  category (one of the categories above)\n"
        f"  reasoning (max 80 chars — one sentence explaining the priority)\n\n"
        f"Tasks:\n{todo_list}\n\n"
        f"Return ONLY a JSON array, no markdown, no explanation.\n"
        f'Example: [{{"id": 3, "priority": "medium", "category": "health", "reasoning": "Routine appointment, no acute risk."}}]'
    )

    for attempt in range(3):
        try:
            message = ai.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=1500,
                messages=[{"role": "user", "content": prompt}],
            )
            break
        except Exception as e:
            print(f"API attempt {attempt + 1} failed: {e}")
            if attempt == 2:
                raise
            time.sleep(10)
    raw = message.content[0].text.strip()

    # Strip markdown code blocks if present
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    try:
        results = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"Failed to parse Claude response: {e}")
        print(f"Raw response: {raw}")
        return

    # Update each todo in Supabase
    now = datetime.now(timezone.utc).isoformat()
    urgent_tasks = []
    updated = 0

    for item in results:
        todo_id = item.get("id")
        priority = item.get("priority", "medium")
        category = item.get("category", "general")
        reasoning = item.get("reasoning", "")[:80]

        if not todo_id:
            continue

        supa.table("todos").update({
            "priority": priority,
            "priority_reasoning": reasoning,
            "category": category,
            "processed": 1,
            "updated_at": now,
        }).eq("id", todo_id).execute()
        updated += 1

        if priority == "high":
            matching = [t for t in todos if str(t["id"]) == str(todo_id)]
            if matching:
                urgent_tasks.append(matching[0]["text"])

    print(f"Updated {updated} tasks.")

    # Send ntfy for high priority tasks
    for task_text in urgent_tasks:
        requests.post(
            f"https://ntfy.sh/{NTFY_TOPIC}",
            data=task_text.encode("utf-8"),
            headers={
                "Title": "High priority task",
                "Priority": "high",
                "Tags": "rotating_light",
            },
            timeout=10,
        )
        print(f"Sent urgent notification for: {task_text[:60]}")

    print(f"Done. {updated} tasks prioritised, {len(urgent_tasks)} high-priority notifications sent.")


if __name__ == "__main__":
    main()
