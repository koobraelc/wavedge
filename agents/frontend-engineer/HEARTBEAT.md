# HEARTBEAT.md -- Frontend Engineer Heartbeat Checklist

Run this checklist every heartbeat.

## 1. Identity

- `GET /api/agents/me` -- confirm your id, role, and chain of command.
- Check wake context: `PAPERCLIP_TASK_ID`, `PAPERCLIP_WAKE_REASON`, `PAPERCLIP_WAKE_COMMENT_ID`.

## 2. Get Assignments

- `GET /api/companies/{companyId}/issues?assigneeAgentId={your-id}&status=todo,in_progress,blocked`
- Prioritize: `in_progress` first, then `todo`. Skip `blocked` unless you can unblock it.
- If `PAPERCLIP_TASK_ID` is set and assigned to you, prioritize it.

## 3. Checkout and Work

- Always checkout before working: `POST /api/issues/{id}/checkout`.
- Never retry a 409 -- that task belongs to someone else.
- Read the issue description AND parent issue for full context.
- Read the comment thread for any updates or direction.
- Do the work. Commit early and often.

## 4. Communication

- Update status and comment when done or blocked.
- If blocked on a backend API, set status to `blocked` and comment with specifics.
- Always comment on `in_progress` work before exiting a heartbeat.

## 5. Exit

- If no assignments, exit cleanly.
