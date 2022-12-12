import dataclasses
from typing import Tuple, Optional, List, NamedTuple, Dict, ClassVar, Any
import abc
from dataclasses import dataclass
from apf.osmnx_provider import OSMNXProvider


@dataclass()
class OptionField:
    type_name: ClassVar[str]
    value_type: ClassVar[type]

    name: str
    display_name: str
    description: str

    @abc.abstractmethod
    def validate_value(self, value) -> bool:
        """Check whether the value is valid for the field."""
        raise NotImplementedError


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

    @abc.abstractmethod
    def validate_value(self, value) -> bool:
        return isinstance(value, self.value_type) and value in (x.name for x in self.values)

    def __post_init__(self):
        if len(self.values) != len(set((x.name for x in self.values))):
            raise ValueError("values must be unique")


@dataclass()
class OptionFieldCheckbox(OptionField):
    type_name = "checkbox"
    value_type = bool

    default_value: Optional[bool]

    @abc.abstractmethod
    def validate_value(self, value) -> bool:
        return isinstance(value, self.value_type)


@dataclass()
class OptionFieldNumber(OptionField):
    type_name = "number"
    value_type = int

    min_value: int
    max_value: int
    default_value: Optional[int]

    @abc.abstractmethod
    def validate_value(self, value) -> bool:
        return isinstance(value, self.value_type) and self.min_value <= value <= self.max_value


@dataclass()
class OptionFieldRange(OptionField):
    type_name = "range"
    value_type = int

    min_value: int
    max_value: int
    default_value: Optional[int]

    @abc.abstractmethod
    def validate_value(self, value) -> bool:
        return isinstance(value, self.value_type) and self.min_value <= value <= self.max_value


class PlannerInterface(abc.ABC):
    def __init__(self, provider: OSMNXProvider):
        self._provider: OSMNXProvider = provider

    @property
    def provider(self):
        return self._provider

    @classmethod
    @abc.abstractmethod
    def internal_name(cls) -> str:
        """A name that uniquely identifies this planner. Should only contain lowercase letters and the '_' character."""
        raise NotImplementedError

    @classmethod
    @abc.abstractmethod
    def display_name(cls) -> str:
        """A nice name for the planner."""
        raise NotImplementedError

    @classmethod
    @abc.abstractmethod
    def description(cls) -> str:
        """A nice description of the planner. Should be 1-2 sentences at max."""
        raise NotImplementedError

    @classmethod
    @abc.abstractmethod
    def fields_schema(cls) -> List[OptionField]:
        raise NotImplementedError

    @abc.abstractmethod
    def plan(self, coord_from: Tuple[float, float], coord_to: Tuple[float, float], options: Dict[str, Any]) -> Optional[List[Tuple[float, float]]]:
        """Plans a route from 'coord_from' to 'coord_to'. Returns a list of waypoints."""
        raise NotImplementedError

