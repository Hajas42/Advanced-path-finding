import dataclasses
from typing import Tuple, Optional, List, NamedTuple, Dict, ClassVar, Any
import abc
from dataclasses import dataclass
import json


@dataclass()
class OptionField:
    type_name: ClassVar[str]
    value_type: ClassVar[type]

    name: str
    display_name: str
    description: str


@dataclass()
class OptionFieldSelectOption:
    name: str
    display_name: str


@dataclass()
class OptionFieldSelect(OptionField):
    type_name = "select"
    value_type = str

    values: List[OptionFieldSelectOption]
    default_value: Optional[str]


@dataclass()
class OptionFieldCheckbox(OptionField):
    type_name = "checkbox"
    value_type = bool

    default_value: Optional[bool]


@dataclass()
class OptionFieldNumber(OptionField):
    type_name = "number"
    value_type = int

    min_value: int
    max_value: int
    default_value: Optional[int]


@dataclass()
class OptionFieldRange(OptionField):
    type_name = "range"
    value_type = int

    min_value: int
    max_value: int
    default_value: Optional[int]


class PlannerInterface(abc.ABC):
    @abc.abstractmethod
    def internal_name(self) -> str:
        """A name that uniquely identifies this planner. Should only contain lowercase letters and the '_' character."""
        raise NotImplementedError

    @abc.abstractmethod
    def display_name(self) -> str:
        """A nice name for the planner."""
        raise NotImplementedError

    @abc.abstractmethod
    def description(self) -> str:
        """A nice description of the planner. Should be 1-2 sentences at max."""
        raise NotImplementedError

    @abc.abstractmethod
    def fields_schema(self) -> List[OptionField]:
        raise NotImplementedError

    @abc.abstractmethod
    def plan(self, coord_from: Tuple[float, float], coord_to: Tuple[float, float], options: Dict[str, Any]) -> Optional[List[Tuple[float, float]]]:
        """Plans a route from 'coord_from' to 'coord_to'. Returns a list of waypoints."""
        raise NotImplementedError

