from typing import Optional, Tuple, List
from collections import OrderedDict
import osmnx as ox
import osmnx.downloader
from . import geocoder


# TODO: put this somewhere more sensible
ox.config(use_cache=True, cache_folder='/tmp/osmnx_cache/')


class NominatimGeocoder(geocoder.GeocoderInterface):
    def geocode(self, query: str, max_results: int = 1) -> List[geocoder.GeocodingResult]:
        try:
            params = OrderedDict()
            params["format"] = "jsonv2"
            params["limit"] = max_results
            params["dedupe"] = 0
            params["q"] = query
            response_json = osmnx.downloader.nominatim_request(params=params, request_type="search")
            return [
                geocoder.GeocodingResult(
                    lat=x["lat"],
                    lon=x["lon"],
                    importance=x["importance"],
                    name=x["display_name"],
                )
                for x in response_json
            ]
        except Exception as e:
            return []

    def reverse(self, latlon: Tuple[float, float]) -> Optional[geocoder.GeocodingResult]:
        try:
            params = OrderedDict()
            params["format"] = "jsonv2"
            params["lat"] = latlon[0]
            params["lon"] = latlon[1]
            params["zoom"] = 17     # See: https://nominatim.org/release-docs/latest/api/Reverse/#result-limitation
            response_json = osmnx.downloader.nominatim_request(params=params, request_type="reverse")
            return geocoder.GeocodingResult(
                    lat=response_json["lat"],
                    lon=response_json["lon"],
                    importance=response_json["importance"],
                    name=response_json["display_name"],
                )
        except Exception as e:
            return None


