"""Tests for glossary correction engine and context prompt injection."""

from core.glossary.glossary import GlossaryEngine, TechnicalGlossary


def test_default_tech_corrections():
    engine = GlossaryEngine()

    sample = "we are deploying coober netties with g rpc and fast api on dockers"
    corrected = engine.correct_text(sample)

    assert "Kubernetes" in corrected
    assert "gRPC" in corrected
    assert "FastAPI" in corrected
    assert "Docker" in corrected
    assert "coober netties" not in corrected


def test_room_specific_glossary_override():
    engine = GlossaryEngine()

    glossary = TechnicalGlossary(
        room_id="room-alpha",
        terms=["OpenAI", "Anthropic", "LOCE"],
        speakers=["Dr. Chen", "Linus"],
        replacements={
            r"\blocky\b": "LOCE",
            r"\bclaude three\b": "Claude 3.5",
        },
    )
    engine.register_room_glossary(glossary)

    # In room-alpha
    text = "Speaker Linus presented locky and claude three on coobernetes"
    corrected_alpha = engine.correct_text(text, room_id="room-alpha")
    assert "LOCE" in corrected_alpha
    assert "Claude 3.5" in corrected_alpha
    assert "Kubernetes" in corrected_alpha

    # In default room, 'locky' should not be replaced
    corrected_default = engine.correct_text("locky is here", room_id="_default")
    assert "locky" in corrected_default


def test_build_prompt_context():
    engine = GlossaryEngine()
    glossary = TechnicalGlossary(
        room_id="main-stage",
        terms=["BidiGenerateContent", "AsyncIO"],
        speakers=["Sarah Connor"],
    )
    engine.register_room_glossary(glossary)

    ctx = engine.build_prompt_context("main-stage")
    assert "BidiGenerateContent" in ctx["terms"]
    assert "Sarah Connor" in ctx["speakers"]
