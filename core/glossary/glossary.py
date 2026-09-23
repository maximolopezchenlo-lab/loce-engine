"""Technical glossary and speech post-correction engine for conference nomenclature."""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Optional
from pydantic import BaseModel, Field

logger = logging.getLogger("loce.glossary")

# Standard tech conference terminology replacements (common ASR hallucinations -> canonical forms)
DEFAULT_TECH_CORRECTIONS = {
    # Kubernetes & Containers
    r"\bcoober\s*net+ies?\b": "Kubernetes",
    r"\bcoobernetes\b": "Kubernetes",
    r"\bk8s?\b": "Kubernetes",
    r"\bdockers?\b": "Docker",
    r"\bpodman\b": "Podman",
    # Protocols & Arch
    r"\bg\s*rpc\b": "gRPC",
    r"\bgrpc\b": "gRPC",
    r"\bweb\s*socket[s]?\b": "WebSocket",
    r"\bweb\s*rtc\b": "WebRTC",
    r"\bserver\s*sent\s*events\b": "Server-Sent Events",
    r"\bpub\s*sub\b": "Pub/Sub",
    r"\brtmp\b": "RTMP",
    # Frameworks & Languages
    r"\bfast\s*api\b": "FastAPI",
    r"\bpydantic\b": "Pydantic",
    r"\basync\s*i\s*o\b": "AsyncIO",
    r"\buvicorn\b": "Uvicorn",
    r"\btailwind\b": "Tailwind CSS",
    r"\btype\s*script\b": "TypeScript",
    r"\bnext\s*js\b": "Next.js",
    # AI & Models
    r"\bgemini\s*live\b": "Gemini Live",
    r"\bbidi\s*generate\s*content\b": "BidiGenerateContent",
    r"\bbidi\b": "BidiGenerateContent",
    r"\bmultimodal\b": "multimodal",
    r"\btransformer[s]?\b": "Transformers",
    r"\bwhisper\b": "Whisper",
    r"\bgemma\b": "Gemma",
    r"\bback\s*pressure\b": "backpressure",
    r"\blatency\b": "latency",
    r"\bthroughput\b": "throughput",
}


class TechnicalGlossary(BaseModel):
    """Glossary configuration model containing terms, speakers, and direct mapping rules."""

    room_id: str
    terms: list[str] = Field(default_factory=list, description="Target technical terms to highlight")
    speakers: list[str] = Field(default_factory=list, description="Speakers in this session")
    replacements: dict[str, str] = Field(
        default_factory=dict,
        description="Regex pattern to canonical replacement mapping",
    )


class GlossaryEngine:
    """Prepares system prompt context instructions and stabilizes speech output via post-correction."""

    def __init__(self, default_corrections: Optional[dict[str, str]] = None) -> None:
        self._base_corrections = dict(default_corrections or DEFAULT_TECH_CORRECTIONS)
        self._room_glossaries: dict[str, TechnicalGlossary] = {}
        self._compiled_regexes: dict[str, list[tuple[re.Pattern[str], str]]] = {}
        self._compile_room_regex("_default", self._base_corrections)

    def register_room_glossary(self, glossary: TechnicalGlossary) -> None:
        """Register or update a room-specific glossary."""
        self._room_glossaries[glossary.room_id] = glossary
        # Merge base corrections with room specific replacements
        merged = dict(self._base_corrections)
        merged.update(glossary.replacements)

        # Automatically add exact match boundary rules for all explicit terms
        for term in glossary.terms:
            pattern = rf"\b{re.escape(term.lower())}\b"
            merged[pattern] = term

        self._compile_room_regex(glossary.room_id, merged)
        logger.info(
            f"Registered glossary for room '{glossary.room_id}' with {len(glossary.terms)} terms "
            f"and {len(glossary.speakers)} speakers."
        )

    def get_room_glossary(self, room_id: str) -> TechnicalGlossary:
        """Retrieve the configured glossary for a room, or return a default instance."""
        if room_id in self._room_glossaries:
            return self._room_glossaries[room_id]
        return TechnicalGlossary(
            room_id=room_id,
            terms=list(self._base_corrections.values())[:15],
            speakers=[],
            replacements={},
        )

    def build_prompt_context(self, room_id: str) -> dict[str, list[str]]:
        """Extract prioritized glossary terms and speakers for model system instructions."""
        glossary = self.get_room_glossary(room_id)
        # Unique ordered terms
        terms = list(dict.fromkeys(glossary.terms + [v for v in self._base_corrections.values() if len(v) > 2]))
        return {
            "terms": terms[:40],
            "speakers": glossary.speakers,
        }

    def correct_text(self, text: str, room_id: Optional[str] = None) -> str:
        """Apply fast regex-based post-correction to stabilize technical jargon and names."""
        if not text:
            return text

        key = room_id if (room_id and room_id in self._compiled_regexes) else "_default"
        patterns = self._compiled_regexes.get(key, self._compiled_regexes["_default"])

        corrected = text
        for pattern, replacement in patterns:
            corrected = pattern.sub(replacement, corrected)

        return corrected

    def _compile_room_regex(self, room_key: str, rules: dict[str, str]) -> None:
        """Compile regex rules once for high-throughput string replacement."""
        compiled = []
        for pat_str, repl in rules.items():
            try:
                p = re.compile(pat_str, re.IGNORECASE)
                compiled.append((p, repl))
            except re.error as e:
                logger.warning(f"Invalid regex rule '{pat_str}': {e}")
        self._compiled_regexes[room_key] = compiled

    def export_json(self, room_id: str) -> str:
        """Serialize glossary configuration to JSON."""
        return self.get_room_glossary(room_id).model_dump_json(indent=2)

    def load_from_file(self, file_path: Path) -> None:
        """Load and register glossary definitions from a JSON file."""
        if not file_path.exists():
            return
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                for item in data:
                    self.register_room_glossary(TechnicalGlossary(**item))
            elif isinstance(data, dict):
                self.register_room_glossary(TechnicalGlossary(**data))
