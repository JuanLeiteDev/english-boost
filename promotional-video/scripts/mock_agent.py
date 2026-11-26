"""Rehearsed tutor for the demo copy of the app (never used by the real app).

The app runs this file exactly like the Claude Code CLI (`-p --output-format stream-json ...`)
and reads its JSON events, so the chat UI, the streaming and the "open" pills are all real.
The replies are short versions of real replies from Juan's chat history, so every take of
the screen recording looks the same and no account usage is spent.
"""
import json
import sys
import time
import uuid


def out(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


REPLIES = [
    {  # Cambridge listening: send the learner straight to the official test
        "match": ["listening"],
        "tools": [("Skill", {"skill": "daily-study-planner"}),
                  ("Read", {"file_path": "plan/weeks/semana-02.md"}),
                  ("Read", {"file_path": "resources/catalog.md"})],
        "text": "Today's listening is **Cambridge B1 Preliminary, Part 1**. You hear 7 short recordings, "
                "two times each. Choose **A**, **B** or **C**.\n\n"
                "[[open:url:https://ceq.inspera.com/player/?assessmentRunId=539335544&context=exam]]\n\n"
                "Send me your answers, like `1. B`.",
    },
    {  # answers to the Cambridge test, checked with the official key
        "match": ["1. b", "1.b", "1 b"],
        "tools": [("Skill", {"skill": "english-examiner"}),
                  ("Read", {"file_path": "materials/official/b1-preliminary/answer-key.pdf"}),
                  ("Edit", {"file_path": "assessments/2026-12-07-listening.md"}),
                  ("Edit", {"file_path": "progress/error-log.md"})],
        "text": "**B1 listening, Part 1: 6/7 (86%).** That is a strong result for this part.\n\n"
                "You missed **question 6**: you chose **C**, the key says **B**.\n\n"
                "Listen to number 6 one more time. Listen for **but** and **in the end**: "
                "they often show that a plan changed. What did the speaker do in the end?",
    },
    {  # speaking: the transcript from the microphone
        "match": ["belgium", "erasmus", "months"],
        "tools": [("Skill", {"skill": "speaking-coach"}),
                  ("Edit", {"file_path": "speaking/2026-12-07-why-belgium.md"})],
        "text": "Great, Juan! I understood you, and your sentence was clear.\n\n"
                "One fix:\n\n"
                "- ~~on two months~~ → **in two months**\n\n"
                "We use **in** + time for the future: *I'm going to Belgium **in** two months.*\n\n"
                "Now say it again, and add one reason why you chose Howest.",
    },
]
DEFAULT = {"match": [], "tools": [("Skill", {"skill": "daily-study-planner"})],
           "text": "Good! Let's look at today's plan together.\n\n[[open:today]]"}


def main():
    prompt = sys.stdin.read().lower()
    reply = next((r for r in REPLIES if any(m in prompt for m in r["match"])), DEFAULT)
    sid = str(uuid.uuid4())
    out({"type": "system", "subtype": "init", "session_id": sid})
    time.sleep(0.5)
    for name, inp in reply["tools"]:
        out({"type": "assistant", "message": {"content": [{"type": "tool_use", "name": name, "input": inp}]}})
        time.sleep(0.45)
    out({"type": "stream_event", "event": {"type": "message_start"}})
    text = reply["text"]
    i = 0
    while i < len(text):  # stream in small word chunks, like the real CLI
        j = text.find(" ", i + 1)
        j = len(text) if j < 0 else j
        out({"type": "stream_event", "event": {"type": "content_block_delta",
                                                "delta": {"type": "text_delta", "text": text[i:j]}}})
        i = j
        time.sleep(0.028)
    out({"type": "assistant", "message": {"content": [{"type": "text", "text": text}]}})
    out({"type": "result", "subtype": "success", "is_error": False, "session_id": sid, "result": text})


if __name__ == "__main__":
    main()
