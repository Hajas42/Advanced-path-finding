from typing import Tuple, Optional, List, NamedTuple
import abc


class GeocodingResult(NamedTuple):
    lat: float
    lon: float
    importance: float
    name: str


class GeocoderInterface(abc.ABC):
    @abc.abstractmethod
    def geocode(self, query: str, max_results: int = 1) -> List[GeocodingResult]:
        """
        Tries to resolve a textual query.
        It returns a list of coordinates alongside with their display names.
        """
        raise NotImplementedError

    @abc.abstractmethod
    def reverse(self, latlon: Tuple[float, float]) -> Optional[GeocodingResult]:
        """
        Tries to compute the address for a given coordinate.
        It returns a single coordinate alongside with the display name.
        """
        raise NotImplementedError

