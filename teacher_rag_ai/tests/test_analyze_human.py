"""Tests for the human-evaluation analysis. The fixtures below are SYNTHETIC and exist only to test the code;
they are generated inside the tests and are never written to the results directory or used in the paper."""
import json
import sys, os
import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from eval import analyze_human as ah  # noqa: E402


def test_sus_extremes_and_neutral():
    assert ah.sus_score([5, 1, 5, 1, 5, 1, 5, 1, 5, 1]) == 100
    assert ah.sus_score([1, 5, 1, 5, 1, 5, 1, 5, 1, 5]) == 0
    assert ah.sus_score([3] * 10) == 50
    with pytest.raises(ValueError):
        ah.sus_score([1, 2, 3])


def test_weighted_kappa_known_values():
    a = [1, 2, 3, 4, 5, 3, 2, 4]
    assert ah.weighted_kappa(a, a) == pytest.approx(1.0)
    # systematically opposite ratings give a strongly negative kappa
    assert ah.weighted_kappa([1, 1, 5, 5], [5, 5, 1, 1]) < -0.5


def test_binary_kappa():
    assert ah.cohen_kappa_binary([1, 0, 1, 0], [1, 0, 1, 0]) == pytest.approx(1.0)
    assert ah.cohen_kappa_binary([1, 1, 0, 0], [0, 0, 1, 1]) == pytest.approx(-1.0)


def test_cronbach_alpha_perfectly_consistent_items():
    base = np.array([1, 2, 3, 4, 5, 2, 3])
    X = np.column_stack([base, base, base])
    assert ah.cronbach_alpha(X) == pytest.approx(1.0)


def _export():
    rng = np.random.default_rng(0)
    surveys = [{"participant": f"p{i}", "instrument": "sus", "answers": [int(x) for x in rng.integers(1, 6, 10)], "score": 0} for i in range(6)]
    surveys += [{"participant": f"p{i}", "instrument": "usefulness", "answers": [int(x) for x in rng.integers(1, 6, 8)], "score": 0} for i in range(6)]
    ratings = [{"participant": f"p{i % 6}", "message": f"m{i}", "helpful": int(rng.integers(1, 6)), "citationSupport": "yes", "comment": None} for i in range(18)]
    reviews = []
    for m in range(12):
        base = int(rng.integers(2, 6))
        for r in ("R1", "R2"):
            reviews.append({"reviewer": r, "message": f"m{m}", "relevance": base, "factualAccuracy": base, "groundingQuality": min(5, base + (r == "R2")),
                            "educationalValue": base, "citationQuality": base, "revealedSolution": bool(m % 2), "notes": None})
    return {"meta": {"note": "Anonymised export of consenting participants only.", "participantsAgreed": 6, "participantsDeclined": 1, "consentVersion": 1},
            "surveys": surveys, "answerRatings": ratings, "expertReviews": reviews}


def test_analyze_runs_and_warns_on_small_samples(tmp_path):
    res = ah.analyze(_export())
    assert res["sus"]["n"] == 6 and 0 <= res["sus"]["mean"] <= 100
    assert res["answerRatings"]["n_participants"] == 6
    pair = res["expertReviews"]["agreement"]["R1-R2"]
    assert pair["items"] == 12 and pair["sufficient"]
    assert pair["dimensions"]["relevance"]["weighted_kappa"] == pytest.approx(1.0)
    assert pair["revealedSolution_kappa"]["kappa"] == pytest.approx(1.0)
    assert any("pilot" in w for w in res["warnings"])
    ah.write_markdown(res, tmp_path / "out.md")
    assert "SUS" in (tmp_path / "out.md").read_text()


def test_refuses_non_export_files():
    with pytest.raises(SystemExit):
        ah.check_export({"surveys": []})
