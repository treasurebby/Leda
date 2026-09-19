"""Speech-to-text for WhatsApp voice notes via the OpenAI Whisper API."""

import io
from dataclasses import dataclass, field
from typing import Protocol

from app.core.config import settings

PIDGIN_HINT = (
    "Nigerian wholesale order over WhatsApp, in English and Pidgin. Phrases like: send me, make e remain small, "
    "abeg add, half bag, carton, keg, bag of rice, the yellow one, how much, I go pay, na."
)


class Transcriber(Protocol):
    async def transcribe(self, audio: bytes, mime: str, product_names: list[str]) -> str: ...


@dataclass
class FakeTranscriber:
    transcript: str = (
        "Send me like fifty bags of Royal Stallion, make e remain small. Add fifteen kegs of the yellow one."
    )
    calls: list[tuple[int, str]] = field(default_factory=list)

    async def transcribe(self, audio: bytes, mime: str, product_names: list[str]) -> str:
        self.calls.append((len(audio), mime))
        return self.transcript


class WhisperTranscriber:
    def __init__(self, api_key: str, model: str):
        from openai import AsyncOpenAI

        self.client = AsyncOpenAI(api_key=api_key)
        self.model = model

    async def transcribe(self, audio: bytes, mime: str, product_names: list[str]) -> str:
        ext = {
            "audio/ogg": "ogg",
            "audio/mpeg": "mp3",
            "audio/mp4": "m4a",
            "audio/wav": "wav",
            "audio/webm": "webm",
        }.get(mime.split(";")[0], "ogg")
        buf = io.BytesIO(audio)
        buf.name = f"voice.{ext}"
        prompt = PIDGIN_HINT + " Products: " + ", ".join(product_names[:60])
        result = await self.client.audio.transcriptions.create(model=self.model, file=buf, language="en", prompt=prompt)
        return result.text.strip()


_default: Transcriber | None = None


def get_transcriber() -> Transcriber:
    global _default
    if _default is None:
        _default = (
            WhisperTranscriber(settings.openai_api_key, settings.whisper_model)
            if settings.openai_api_key
            else FakeTranscriber()
        )
    return _default


def set_transcriber(t: Transcriber | None) -> None:
    global _default
    _default = t
