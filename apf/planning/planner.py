from typing import Tuple, Optional, List, NamedTuple, Dict, ClassVar
import abc


class PlannerInterface(abc.ABC):
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

    # @abc.abstractmethod
    # def get_option_descriptions(self) -> List[PlannerOptionDescription]:
    #     raise NotImplementedError
    #
    # @abc.abstractmethod
    # def get_default_options(self) -> List[PlannerOptionDescription]:
    #     raise NotImplementedError

    @abc.abstractmethod
    def plan(self, coord_from: Tuple[float, float], coord_to: Tuple[float, float], options: Dict) -> Optional[List[Tuple[float, float]]]:
        """Plans a route from 'coord_from' to 'coord_to'. Returns a list of waypoints."""
        raise NotImplementedError

