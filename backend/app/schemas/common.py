from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, PlainSerializer

# Money leaves the API as a string with exactly two decimals ("78500.00"), never a float.
Money = Annotated[
    Decimal,
    PlainSerializer(
        lambda d: str(Decimal(d).quantize(Decimal("0.01"), ROUND_HALF_UP)), return_type=str, when_used="json"
    ),
]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Message(BaseModel):
    detail: str
