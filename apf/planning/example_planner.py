import math
import random
from typing import Tuple, Dict, List, Optional

from . import planner


class DrunkPilotPlanner(planner.PlannerInterface):
    _OPTIONS = [
        planner.OptionFieldRange(
            name="drunk_factor", display_name="Drunk factor", description="How much jitter to apply", min_value=0,
            max_value=50, default_value=5
        ),
    ]

    @classmethod
    def internal_name(cls) -> str:
        return "drunk_pilot_planner"

    @classmethod
    def display_name(cls) -> str:
        return "Drunk Pilot"

    @classmethod
    def description(cls) -> str:
        return "An example planner."

    @classmethod
    def fields_schema(cls) -> List[planner.OptionField]:
        return cls._OPTIONS

    def __init__(self):
        pass

    def plan(self, coord_from: Tuple[float, float], coord_to: Tuple[float, float], options: Dict) -> Optional[List[Tuple[float, float]]]:
        # Linearly interpolate between coords (completely disregarding how coordinates work)
        ret = [coord_from]
        N = 10
        v = coord_to[0]-coord_from[0], coord_to[1]-coord_from[1]
        l = math.sqrt(v[0]*v[0] + v[1]*v[1])
        n = -v[1]/l, v[0]/l
        for i in range(1, N):
            k = i / N
            r = (random.random() * 2.0 - 1.0) * options["drunk_factor"] / 10000.0
            jitter = n[0] * r, n[1] * r
            ret.append(tuple(coord_from[j] * (1 - k) + coord_to[j] * k + jitter[j] for j in (0, 1)))
        ret.append(coord_to)
        return ret

