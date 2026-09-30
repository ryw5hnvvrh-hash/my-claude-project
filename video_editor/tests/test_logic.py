import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from autoedit.timeline import Remapper, keep_ranges
from autoedit.transcribe import Word, build_cues, mark_disfluencies


def W(s, e, t):
    return Word(s, e, t)


def test_fillers_and_repeats():
    words = [W(0.0, 0.3, "음,"), W(0.4, 0.8, "이거"), W(0.85, 1.2, "이거"), W(1.3, 1.6, "제가"),
             W(2.0, 2.1, "그,"), W(2.3, 2.8, "그러니까"), W(3.0, 3.3, "그"), W(3.35, 3.7, "사람")]
    mark_disfluencies(words)
    assert [w.removed for w in words] == ["filler", "repeat", "", "", "repeat", "", "", ""]


def test_soft_filler_kept_without_pause():
    words = [W(0.0, 0.2, "아"), W(0.22, 0.6, "맞다")]
    mark_disfluencies(words)
    assert words[0].removed == ""


def test_keep_ranges_and_remap():
    keeps = keep_ranges(10.0, [(2.0, 3.0), (5.0, 6.0)], fps=10)
    assert keeps == [(0.0, 2.0), (3.0, 5.0), (6.0, 10.0)]
    r = Remapper(keeps)
    assert r.total == 8.0
    assert r.map(2.5) is None
    assert r.map(3.5) == 2.5
    assert r.map_range(1.5, 3.5) == (1.5, 2.5)


def test_cues_split_by_length_and_punctuation():
    words = [W(0, 0.5, "안녕하세요."), W(0.6, 1.0, "오늘은"), W(1.1, 1.5, "키링을"), W(1.6, 2.0, "만들어요")]
    cues = build_cues(words, max_chars=10)
    assert [c[2] for c in cues] == ["안녕하세요", "오늘은 키링을", "만들어요"]
