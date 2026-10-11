"""Build content/words-en.json, the English word pack.

Words are ranked by wordfreq, kept only if they appear in the ESDB/SCOWL
size-50 American word list as an all-lowercase entry (which drops proper
nouns, abbreviations and misspellings), and filtered against
content/blocklist.json.

Usage:
    pip install wordfreq==3.1.1
    # build ESDB (https://github.com/en-wl/wordlist) and export the list:
    #   make && ./scowl --db scowl.db word-list 50 A 1 --categories= --deaccent > scowl50.txt
    python content/build/build_words.py --scowl path/to/scowl50.txt
"""

import argparse
import json
import re
from pathlib import Path

import wordfreq

ROOT = Path(__file__).resolve().parents[2]
TARGET_COUNT = 10_000
CANDIDATES = 60_000
LETTERS_ONLY = re.compile(r"^[a-z]+$")
# Single letters are not useful practice words, except these two.
SINGLE_LETTER_WORDS = {"a"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scowl", required=True, type=Path)
    args = parser.parse_args()

    scowl = {
        line.strip()
        for line in args.scowl.read_text(encoding="utf-8").splitlines()
        if LETTERS_ONLY.match(line.strip())
    }
    blocklist = json.loads((ROOT / "content" / "blocklist.json").read_text())
    blocked = set(blocklist["words"])

    words: list[str] = []
    for word in wordfreq.top_n_list("en", CANDIDATES):
        if not LETTERS_ONLY.match(word):
            continue
        if len(word) == 1 and word not in SINGLE_LETTER_WORDS:
            continue
        if len(word) > 14 or word not in scowl or word in blocked:
            continue
        if any(root in word for root in blocklist["roots"]):
            continue
        words.append(word)
        if len(words) == TARGET_COUNT:
            break

    out = {
        "id": "en",
        "name": "English words",
        "version": 1,
        "license": "CC BY-SA 4.0",
        "credits": [
            "Word frequencies from wordfreq by Robyn Speer, CC BY-SA 4.0 (https://github.com/rspeer/wordfreq)",
            "Filtered with the English Speller Database (SCOWL), copyright Kevin Atkinson (https://github.com/en-wl/wordlist)",
        ],
        "words": words,
    }
    path = ROOT / "content" / "words-en.json"
    path.write_text(json.dumps(out, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"wrote {len(words)} words to {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
