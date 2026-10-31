#!/usr/bin/env python3
"""
hookscore.py - score the first line of a Reel on the five things strong hooks
have in common, and rank a batch of them against each other.

What this is:  five local heuristics, computed on your machine from the text
alone. They measure properties that hooks which hold attention tend to share -
a length you can say in under three seconds, a concrete marker, something at stake,
the payload at the front rather than the back, and a viewer to aim it at.

What this is NOT:  a view predictor. It was tested against 74 real short-form
hooks, transcribed from the first three seconds of the top eight and bottom
eight performers on five channels. Separating a real hook from a deliberately
bad one it does well: AUC 0.83, and 9 of 10 written-to-be-bad hooks scored
below the real median. Separating a good creator's hits from that same
creator's misses it barely does at all: AUC 0.56, where 0.50 is a coin flip.

So use it for what it measured well. It catches greetings, preambles, hooks
with nothing concrete in them and hooks that take five seconds to say. It will
not tell you which of two decent hooks will travel, and nothing that reads text
can, because that is decided by your face, your edit, your audio and who
Instagram shows it to. Trust the retention graph over this script.

Each check returns 0 to 100. Higher is better.

Usage
  python3 hookscore.py hooks.txt              # one hook per line, ranked
  python3 hookscore.py --hook "I lost $18,000 on one missing contract."
  pbpaste | python3 hookscore.py -
  python3 hookscore.py hooks.txt --json
"""

import argparse
import json
import re
import statistics
import sys

WORD_RE = re.compile(r"[A-Za-z0-9\uAC00-\uD7A3$%'’-]+")  # Hangul included
NUMBER_RE = re.compile(
    r"\$\s?\d[\d,]*(?:\.\d+)?"                       # money, whole
    r"|\b\d[\d,]*(?:\.\d+)?\s?"                      # a figure, with or
    r"(?:%|k\b|x\b|hrs?\b|hours?\b|mins?\b|minutes?\b"  # without a unit
    r"|days?\b|weeks?\b|months?\b|years?\b)?",
    re.IGNORECASE)
PROPER_RE = re.compile(r"(?<!^)\b[A-Z][a-z]{2,}\b")
HASHTAG_RE = re.compile(r"(?:^|\s)#\w+")
EMOJI_RE = re.compile(r"[\U0001F300-\U0001FAFF☀-➿]")

# Spoken hooks say their numbers out loud. "Zero dollars" and "twenty grand"
# are as concrete as "$0" and "$20,000", and counting only digits missed them.
# "one" and "first" are deliberately absent: they are filler far more often
# than they are a quantity.
SPOKEN_NUMBERS = {
    "zero", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "fifteen", "twenty", "thirty", "forty", "fifty",
    "sixty", "seventy", "eighty", "ninety", "hundred", "thousand", "million",
    "billion", "dozen", "half", "twice", "triple",
}
MONEY_WORDS = {
    "dollars", "dollar", "bucks", "grand", "percent", "cents",
    "millionaire", "billionaire", "revenue", "profit", "salary", "rent",
}

# Words that put something on the line. A hook with none of these is a
# statement; a hook with one is a reason to keep watching.
STAKES = {
    "stop", "never", "wrong", "mistake", "mistakes", "lost", "lose", "losing",
    "cost", "costs", "broke", "broken", "failed", "failure", "fail", "nobody",
    "no", "not", "don't", "dont", "doesn't", "didn't", "can't", "won't",
    "quit", "quitting", "fired", "deleted", "delete", "killed", "kills", "kill",
    "replaced", "replaces", "cut", "beat", "free", "paid", "charged", "hired",
    "saved", "first",
    "banned", "illegal", "worst", "hate", "hated", "wasted", "waste", "scam",
    "lie", "lied", "lying", "truth", "secret", "hidden", "stole", "stolen",
    "before", "until", "instead", "but", "except", "unless", "problem",
    "risk", "danger", "warning", "regret", "wish", "should", "shouldn't",
    "still", "already", "only", "without", "versus", "vs", "actually",
}

# Openers that spend the first second saying nothing.
WEAK_OPENERS = [
    "so", "ok", "okay", "hey", "hi", "hello", "guys", "yo", "alright",
    "welcome", "today", "basically", "honestly", "look", "listen", "um",
    "just", "let", "lets", "let's", "i wanted", "i want", "one of",
    "have you", "did you", "do you", "are you", "in this", "in today",
    "the thing", "a lot", "there is", "there are", "this is", "it is",
    "as a", "when it", "if you've", "you know",
]

# Imperatives that earn the front position.
IMPERATIVES = {
    "stop", "steal", "copy", "delete", "try", "watch", "read", "save",
    "use", "build", "make", "write", "send", "take", "start", "quit",
    "never", "always", "don't", "dont", "do", "put", "run", "check",
}

DEALBREAKERS = [
    (re.compile(r"(?i)^\s*(?:stop scrolling|don'?t scroll)"),
     "Opens with \"stop scrolling\". Asking for attention proves you have not earned it."),
    (re.compile(r"(?i)\b(?:in (?:this|today'?s) (?:video|reel)|i'?m going to show you|i'?ll show you how)\b"),
     "Video preamble. Delete it and open on the payoff."),
    (re.compile(r"(?i)^\s*(?:hey |hi |what'?s up |welcome )"),
     "Greeting. Nobody came to the feed to be greeted."),
    (HASHTAG_RE,
     "Hashtag in the hook. Hashtags belong at the bottom of the caption, if anywhere."),
    (EMOJI_RE,
     "Emoji in the hook. On-screen text at hook size has room for words or for an emoji, not both."),
]

# --- Korean -----------------------------------------------------------------
# Korean glues endings onto stems ("망했어요", "버렸는데"), so these are stems
# matched inside each eojeol, not whole words. They only apply when the hook
# contains Hangul, so English scores are unchanged.
HANGUL_RE = re.compile(r"[가-힣]")

KO_STAKES = [
    # loss, failure, cost
    "망했", "망한", "망하", "망칠", "망쳤", "버렸", "버린", "버리", "날렸", "날린",
    "실패", "손해", "적자", "잃", "후회", "실수", "최악", "포기", "폐업", "접을",
    "접어", "접었", "그만", "낭비", "울었", "눈물", "상처", "깨졌", "깨진", "터졌",
    "기포", "불량", "환불", "반품",
    # negation and contrast
    "절대", "아무도", "아무것도", "몰랐", "모르", "없", "못", "말고", "대신",
    "근데", "하지만", "그런데", "오히려", "결국", "아직", "벌써", "겨우", "고작",
    "밖에", "뿐",
    # secrets, firsts, truth
    "비밀", "진짜", "사실은", "솔직히", "처음", "마지막", "유일", "전부", "다시",
    "충격", "실화", "경고", "주의", "문제", "위험",
]
KO_STAKES_RE = re.compile(r"(?:^|\s)안\s|하지\s?마|사지\s?마|지\s?마세요")

# Korean numerals and money words that make a hook checkable.
KO_CONCRETE = [
    "만원", "천원", "백원", "억", "매출", "수익", "순수익", "원가", "월급", "주문",
    "팔로워", "판매", "개월", "시간", "번째",
    "하나도", "두 번", "세 번", "열 번", "백 번", "천 개", "백 개",
]

KO_WEAK_OPENERS = [
    "안녕", "여러분 안녕", "오늘은", "오늘", "음", "어", "자", "그래서", "일단",
    "사실", "이번 영상", "이번 릴스", "이번에는", "제가 오늘", "요즘", "그냥",
    "혹시", "다들",
]

KO_ADDRESS_RE = re.compile(r"여러분|당신|너희|너는|너도|너의|네가|님들|(?:^|\s)너(?:\s|$)|"
                           r"(?:나요|까요|죠|지요|세요|셨나요|있어요|아세요)\s*\?")
KO_IMPERATIVE_RE = re.compile(r"(?:세요|마세요|하지\s?마|지\s?마|해\s?봐|해봐요|하자|저장|따라\s?해)"
                              r"[.!?]?(?:\s|$)")
KO_FIRST_PERSON_RE = re.compile(r"(?:^|\s)(?:저|제가|제|나|내가|내|저희|우리)(?:\s|는|도|가|의|$)")

KO_DEALBREAKERS = [
    (re.compile(r"^\s*(?:스크롤\s*(?:멈춰|멈추|내리지)|잠깐만요?|잠시만요?)"),
     "\"스크롤 멈춰\"로 시작. 관심을 달라고 하는 건 아직 관심을 못 얻었다는 뜻이에요."),
    (re.compile(r"(?:이번|오늘)\s*(?:영상|릴스|시간)(?:에서|은|는)|"
                r"(?:보여|알려|소개해|말씀|설명해)\s?드릴(?:게요|께요|려고)"),
     "영상 예고형 문장(\"오늘은 ~ 보여드릴게요\"). 지우고 결과부터 말하세요."),
    (re.compile(r"^\s*(?:안녕|여러분\s*안녕|하이|반가워|반갑습니다)"),
     "인사로 시작. 피드에 인사받으러 온 사람은 없어요."),
]


def is_korean(text):
    return bool(HANGUL_RE.search(text))


def ko_stake_hits(text):
    hits = []
    for token in words(text):
        for stem in KO_STAKES:
            if stem in token:
                hits.append(stem)
                break
    hits += [m.group(0).strip() for m in KO_STAKES_RE.finditer(text)]
    return hits


def ko_token_is_payload(token):
    return (any(s in token for s in KO_STAKES) or any(c in token for c in KO_CONCRETE)
            or bool(re.search(r"\d", token)))


def clamp(n):
    return max(0.0, min(100.0, n))


def words(text):
    # "$18,000" is one word when it is spoken, so it is one word here too.
    return WORD_RE.findall(re.sub(r"(?<=\d),(?=\d)", "", text))


def check_length(text):
    """A hook has to land before the thumb moves. Roughly two seconds."""
    w = words(text)
    n = len(w)
    chars = len(text.strip())
    if is_korean(text):
        # Korean speaks about 2 eojeol a second, and each eojeol carries more.
        secs = n / 2.0
        if 3 <= n <= 7:
            score = 100.0
        elif n < 3:
            score = clamp(100 - (3 - n) * 25)
        else:
            score = clamp(100 - (n - 7) * 15)
        if chars > 30:                   # two lines of big on-screen Hangul
            score -= 12
        return clamp(score), f"{n} 어절, {chars}자, 약 {secs:.1f}초 (3-7어절 권장)"
    secs = n / 2.75                      # ~165 words per minute, spoken
    if 5 <= n <= 12:
        score = 100.0
    elif n < 5:
        score = clamp(100 - (5 - n) * 20)
    else:
        score = clamp(100 - (n - 12) * 11)
    if chars > 60:                       # two lines of big on-screen text
        score -= 12
    return clamp(score), f"{n} words, {chars} chars, ~{secs:.1f}s spoken (want 5-12 words)"


def check_specificity(text):
    """One concrete thing beats three abstract ones."""
    nums = [n.strip() for n in NUMBER_RE.findall(text) if n.strip()]
    propers = set(PROPER_RE.findall(text))
    low = [w.lower().strip("'’") for w in words(text)]
    spoken = [w for w in low if w in SPOKEN_NUMBERS or w in MONEY_WORDS]
    if is_korean(text):
        spoken += [c for c in KO_CONCRETE if c in text
                   and not any(c in n for n in nums)]
    hits = len(nums) + len(propers) + len(spoken)
    score = 15.0 if hits == 0 else clamp(45 + hits * 30)
    found = ", ".join(nums[:2] + sorted(propers)[:2] + spoken[:2])
    return score, (f"{hits} concrete marker(s)" + (f": {found}" if found else
                   " - no number, no name, nothing checkable"))


def check_stakes(text):
    """Tension, cost, negation. Something the viewer might lose."""
    w = [x.lower().strip("'’") for x in words(text)]
    hits = [x for x in w if x in STAKES]
    if is_korean(text):
        hits += ko_stake_hits(text)
    markers = sorted(set(hits))
    if re.search(r"\$\s?\d", text):
        markers.append("a price")
    n = len(markers)
    score = {0: 20.0, 1: 70.0}.get(n, 100.0)
    detail = f"{n} tension marker(s)" + (f": {', '.join(markers[:4])}" if markers else
                                         " - nothing is at stake in this line")
    return clamp(score), detail


def check_frontload(text):
    """The interesting word cannot be in position nine."""
    w = words(text)
    if not w:
        return 0.0, "empty"
    low = [x.lower().strip("'’") for x in w]
    opener = " ".join(low[:2])
    penalty = 0
    hit_opener = None
    ko = is_korean(text)
    for weak in (KO_WEAK_OPENERS if ko else WEAK_OPENERS):
        if (ko and (low[0] == weak or opener.startswith(weak + " ")
                    or (len(weak) > 1 and low[0].startswith(weak)))) or \
                (not ko and (opener.startswith(weak) or low[0] == weak)):
            penalty, hit_opener = 30, weak
            break
    payload = None
    for i, token in enumerate(low):
        if (token in STAKES or token in SPOKEN_NUMBERS or token in MONEY_WORDS
                or NUMBER_RE.match(w[i]) or (i and PROPER_RE.match(w[i]))
                or (ko and ko_token_is_payload(token))):
            payload = i
            break
    # Korean eojeol pack more in, so the windows are tighter.
    near, mid = (1, 3) if ko else (3, 6)
    if payload is None:
        base = 30.0
        where = "no payload word anywhere in the line"
    elif payload <= near:
        base = 100.0
        where = f"payload at word {payload + 1}"
    elif payload <= mid:
        base = 70.0
        where = f"payload at word {payload + 1}, could move forward"
    else:
        base = 40.0
        where = f"payload at word {payload + 1}, too late"
    detail = where + (f"; weak opener \"{hit_opener}\"" if hit_opener else "")
    return clamp(base - penalty), detail


def check_address(text):
    """Aimed at one viewer, or floating in the air."""
    low = text.lower()
    w = [x.lower().strip("'’") for x in words(text)]
    if re.search(r"\b(you|your|you're|youre|yourself)\b", low):
        return 100.0, "speaks to the viewer"
    if is_korean(text):
        if KO_ADDRESS_RE.search(text):
            return 100.0, "시청자에게 말을 건넴"
        if KO_IMPERATIVE_RE.search(text):
            return 90.0, "명령/권유형 (\"~하세요\", \"~하지 마\")"
        if KO_FIRST_PERSON_RE.search(text):
            return 70.0, "1인칭, 시청자 언급 없음"
        # Korean drops the subject; an unmarked line is usually first person.
        return 60.0, "주어 생략(보통 1인칭), 시청자 언급 없음"
    if w and w[0] in IMPERATIVES:
        return 90.0, f"imperative opener (\"{w[0]}\")"
    if re.search(r"\b(i|my|me|we|our)\b", low):
        return 70.0, "first person, no viewer named"
    return 35.0, "third person, nobody in the room"


CHECKS = ["LENGTH", "SPECIFICITY", "STAKES", "FRONTLOAD", "ADDRESS"]


def run(text):
    results = {
        "LENGTH": check_length(text),
        "SPECIFICITY": check_specificity(text),
        "STAKES": check_stakes(text),
        "FRONTLOAD": check_frontload(text),
        "ADDRESS": check_address(text),
    }
    flags = [msg for pattern, msg in DEALBREAKERS if pattern.search(text)]
    if is_korean(text):
        flags += [msg for pattern, msg in KO_DEALBREAKERS if pattern.search(text)]
    scores = [results[c][0] for c in CHECKS]
    # The weakest property caps the hook, same logic as detect.py: one bad
    # property is enough for the thumb to keep moving.
    overall = statistics.mean(scores) * 0.6 + min(scores) * 0.4 - len(flags) * 15
    overall = clamp(overall)
    verdict = "STRONG" if overall >= 70 and min(scores) >= 55 and not flags else (
        "OK" if overall >= 50 else "WEAK")
    return results, overall, verdict, flags


def bar(score, width=24):
    filled = round(score / 100 * width)
    return "#" * filled + "." * (width - filled)


def render_one(text, results, overall, verdict, flags, out=sys.stdout):
    print("\nHOOK SCORE", file=out)
    print("=" * 62, file=out)
    print(f"  \"{text.strip()}\"\n", file=out)
    for name in CHECKS:
        score, detail = results[name]
        print(f"  {name:<13} {bar(score)} {score:5.1f}", file=out)
        print(f"  {'':<13} {detail}", file=out)
    print("-" * 62, file=out)
    print(f"  {'HOOK SCORE':<13} {bar(overall)} {overall:5.1f}   {verdict}", file=out)
    for f in flags:
        print(f"\n  DEALBREAKER  {f}", file=out)
    if verdict != "STRONG":
        weakest = min(CHECKS, key=lambda c: results[c][0])
        print(f"\n  Weakest property: {weakest}. Fix that one and re-run.", file=out)
    print("", file=out)


def render_table(rows, out=sys.stdout):
    print("\nHOOK RANKING\n" + "=" * 78, file=out)
    for i, r in enumerate(rows, 1):
        mark = "->" if i == 1 else "  "
        hook = r["hook"] if len(r["hook"]) <= 62 else r["hook"][:59] + "..."
        print(f"{mark} {r['score']:5.1f} {r['verdict']:<7} {hook}", file=out)
        print(f"        weakest: {r['weakest']} ({r['checks'][r['weakest']]['score']:.0f})", file=out)
        for f in r["flags"]:
            print(f"        dealbreaker: {f}", file=out)
    print("\nShoot the top one. If the top one is under 50, none of these are the hook.\n",
          file=out)


def main():
    ap = argparse.ArgumentParser(description="Score a Reel hook on five properties.")
    ap.add_argument("input", nargs="?", default="-", help="file with one hook per line, or -")
    ap.add_argument("--hook", help="score a single hook given on the command line")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    if args.hook:
        lines = [args.hook]
    else:
        raw = sys.stdin.read() if args.input == "-" else open(args.input, encoding="utf-8").read()
        lines = [l.strip() for l in raw.splitlines() if l.strip()]
    if not lines:
        print("nothing to score", file=sys.stderr)
        sys.exit(2)

    payload = []
    for line in lines:
        results, overall, verdict, flags = run(line)
        payload.append({
            "hook": line,
            "checks": {k: {"score": round(v[0], 1), "detail": v[1]} for k, v in results.items()},
            "weakest": min(CHECKS, key=lambda c: results[c][0]),
            "flags": flags,
            "score": round(overall, 1),
            "verdict": verdict,
        })

    if args.json:
        print(json.dumps(payload if len(payload) > 1 else payload[0], indent=2, ensure_ascii=False))
        return

    if len(payload) == 1:
        results, overall, verdict, flags = run(lines[0])
        render_one(lines[0], results, overall, verdict, flags)
    else:
        render_table(sorted(payload, key=lambda r: -r["score"]))

    sys.exit(0 if max(p["score"] for p in payload) >= 70 else 1)


if __name__ == "__main__":
    main()
