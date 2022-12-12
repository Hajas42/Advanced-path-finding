import math
import networkx as nx
import osmnx as ox
from typing import Tuple, Dict, List, Optional
import geopy.distance

from . import planner


class TouristRoutePlanner(planner.PlannerInterface):
    _OPTIONS = [
        planner.OptionFieldNumber(
            name="max_dist", display_name="Max distance",
            description="Maximum distance from the original route in meters", min_value=10,
            max_value=10000, default_value=500
        ),
        planner.OptionFieldNumber(
            name="max_tourist_places", display_name="Max tourist places",
            description="Maximum number of tourist places to include", min_value=0,
            max_value=50, default_value=5
        )
    ]

    @classmethod
    def internal_name(cls) -> str:
        return "tourist_route_planner"

    @classmethod
    def display_name(cls) -> str:
        return "Tourist Route"

    @classmethod
    def description(cls) -> str:
        return "A route planner that recommends a route that also includes nearby attractions"

    @classmethod
    def fields_schema(cls) -> List[planner.OptionField]:
        return cls._OPTIONS

    def __init__(self, G: nx.MultiDiGraph = ox.graph_from_place('Budapest', network_type='drive')):
        self._G = G

    @staticmethod
    def __generate_key(tourist_place_details):
        relevant_tags = ['tourism', 'name', 'alt_name']
        keys = tourist_place_details.keys()
        key_dict = []
        for tag in relevant_tags:
            if tag in keys and isinstance(tourist_place_details[tag], str):
                key_dict.append((tag, tourist_place_details[tag]))
        return str(key_dict)

    def __heur_func(self, tourist_place, nearest_node, source_node, target_node, route, max_dist):
        if tourist_place[1]['tourism'] in ['hotel', 'hostel', 'motel', 'information', 'guest_house', 'apartment']:
            return -1
        too_far = True
        for node in route:
            if nx.shortest_path_length(self._G, source_node, nearest_node) <= max_dist:
                too_far = False
        if too_far:
            return -1
        try:
            path_length_from_source = nx.shortest_path_length(self._G, source_node, nearest_node)
            path_length_to_target = nx.shortest_path_length(self._G, nearest_node, target_node)
            score = 100 / (path_length_from_source + path_length_to_target)
            keys = tourist_place[1].keys()
            relevant_tags = {'name': 100,
                             'name:en': 20,
                             'url': 60,
                             'website': 60,
                             'phone': 50,
                             'email': 50,
                             'facebook': 50,
                             'wikipedia': 50,
                             'artist_name': 10
                             }
            for tag, value in relevant_tags.items():
                if tag in keys and isinstance(tourist_place[1][tag], str):
                    score = score + value
            return score
        except Exception as ex:
            # print(str(ex) + "\n" + str(tourist_place))
            return -1

    def __calculate_tourist_route(self, source: Tuple[float, float], target: Tuple[float, float], max_dist: int = 1000,
                                  max_tourist_places: int = 5):
        source_node = ox.nearest_nodes(self._G, source[1], source[0])
        target_node = ox.nearest_nodes(self._G, target[1], target[0])
        route = nx.shortest_path(self._G, source_node, target_node)
        heuristic_values = {}

        evaluated_tourist_places = set()
        index = 0
        print("Check1")
        print(geopy.distance.geodesic(source, target).m/2)
        tourist_places = ox.geometries.geometries_from_point(((source[0]+target[0])/2, (source[1]+target[1])/2),
                                                            tags={'tourism': True}, dist=geopy.distance.geodesic(source, target).m/2)
        print("Check2")
        for tourist_place in tourist_places.iterrows():

            print("Check3")
            key = TouristRoutePlanner.__generate_key(tourist_place[1])
            if key not in evaluated_tourist_places:
                evaluated_tourist_places.add(key)
                geometry = tourist_place[1].geometry
                x = geometry.centroid.x
                y = geometry.centroid.y
                nearest_node = ox.nearest_nodes(self._G, x, y)
                score = self.__heur_func(tourist_place, nearest_node, source_node, target_node, route, max_dist)
                if score > 0:
                    heuristic_values[key] = (score, index, nearest_node, tourist_place[1])
                    index = index + 1

        places_sorted_by_scores = {k: v for k, v in
                                   sorted(heuristic_values.items(), key=lambda item: item[1][0], reverse=True)}
        places_sorted_by_scores = list(places_sorted_by_scores.items())
        shortlisted_places = {}
        for i in range(min(max_tourist_places, len(places_sorted_by_scores))):
            shortlisted_places[places_sorted_by_scores[i][0]] = places_sorted_by_scores[i][1]
        places_in_visiting_order = {k: v for k, v in
                                    sorted(shortlisted_places.items(), key=lambda item: item[1][1], reverse=False)}

        route = []
        for key, value in places_in_visiting_order.items():
            tourism_target_node = value[2]
            shortest_path = nx.shortest_path(self._G, source_node, tourism_target_node)[:-1]
            route += shortest_path
            source_node = tourism_target_node

        route += nx.shortest_path(self._G, source_node, target_node)
        return route

    def plan(self, coord_from: Tuple[float, float], coord_to: Tuple[float, float], options: Dict) -> Optional[
                List[Tuple[float, float]]]:
        max_dist = next((option.default_value for option in self.fields_schema() if option.name == 'max_dist'), None)
        if 'max_dist' in options.keys():
            max_dist = options['max_dist']

        max_tourist_places = next(
            (option.default_value for option in self.fields_schema() if option.name == 'max_tourist_places'), None)
        if 'max_tourist_places' in options.keys():
            max_tourist_places = options['max_tourist_places']

        ret = []
        route_nodes = self.__calculate_tourist_route(source=coord_from, target=coord_to, max_dist=max_dist,
                                                     max_tourist_places=max_tourist_places)
        print(route_nodes)
        for node in route_nodes:
            ret.append((self._G.nodes[node]['y'], self._G.nodes[node]['x']))

        return ret
