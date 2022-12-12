import networkx as nx
import osmnx as ox
import time
import sys
import math
import numpy as np
from heapq import heappop, heappush
from itertools import count
import requests
from typing import Tuple, Dict, List, Optional, Any
from apf.osmnx_provider import OSMNXProvider
from dataclasses import dataclass

from . import planner


def _weight_function(G, weight):
    if callable(weight):
        return weight
    # If the weight keyword argument is not callable, we assume it is a
    # string representing the edge attribute containing the weight of
    # the edge.
    if G.is_multigraph():
        return lambda u, v, d: min(attr.get(weight, 1) for attr in d.values())
    return lambda u, v, data: data.get(weight, 1)


def bidirectional_dijkstra(G, source, target, weight="weight"):
    if source not in G or target not in G:
        msg = f"Either source {source} or target {target} is not in G"
        raise nx.NodeNotFound(msg)

    if source == target:
        return (0, [source])

    weight = _weight_function(G, weight)
    push = heappush
    pop = heappop
    # Init:  [Forward, Backward]
    dists = [{}, {}]  # dictionary of final distances
    paths = [{source: [source]}, {target: [target]}]  # dictionary of paths
    fringe = [[], []]  # heap of (distance, node) for choosing node to expand
    seen = [{source: 0}, {target: 0}]  # dict of distances to seen nodes
    c = count()
    # initialize fringe heap
    push(fringe[0], (0, next(c), source))
    push(fringe[1], (0, next(c), target))
    # neighs for extracting correct neighbor information
    if G.is_directed():
        neighs = [G._succ, G._pred]
    else:
        neighs = [G._adj, G._adj]
    # variables to hold the shortest discovered path
    # finaldist = 1e30000
    finalpath = []
    dir = 1
    while fringe[0] and fringe[1]:
        # choose direction
        # dir == 0 is forward direction and dir == 1 is back
        dir = 1 - dir
        # extract closest to expand
        (dist, _, v) = pop(fringe[dir])
        if v in dists[dir]:
            # Shortest path to v has already been found
            continue
        # update distance
        dists[dir][v] = dist  # equal to seen[dir][v]
        if v in dists[1 - dir]:
            # if we have scanned v in both directions we are done
            # we have now discovered the shortest path
            return (finaldist, finalpath)

        for w, d in neighs[dir][v].items():
            # weight(v, w, d) for forward and weight(w, v, d) for back direction
            if dir == 0:
                if v in paths[dir] and len(paths[dir][v]) > 1:
                    cost = weight(G, v, w, d, dir, paths[dir][v][-2])
                else:
                    cost = weight(G, v, w, d, dir)
            else:
                if w in paths[dir] and len(paths[dir][w]) > 1:
                    cost = weight(G, w, v, d, dir, paths[dir][w][-2])
                else:
                    cost = weight(G, w, v, d, dir)

            if cost is None:
                continue
            vwLength = dists[dir][v] + cost
            if w in dists[dir]:
                if vwLength < dists[dir][w]:
                    raise ValueError("Contradictory paths found: negative weights?")
            elif w not in seen[dir] or vwLength < seen[dir][w]:
                # relaxing
                seen[dir][w] = vwLength
                push(fringe[dir], (vwLength, next(c), w))
                paths[dir][w] = paths[dir][v] + [w]
                if w in seen[0] and w in seen[1]:
                    # see if this path is better than the already
                    # discovered shortest path
                    totaldist = seen[0][w] + seen[1][w]
                    if finalpath == [] or finaldist > totaldist:
                        finaldist = totaldist
                        revpath = paths[1][w][:]
                        revpath.reverse()
                        finalpath = paths[0][w] + revpath[1:]
    raise nx.NetworkXNoPath(f"No path between {source} and {target}.")


city_highways = ['living_street', 'primary', 'primary_link', 'residential',
                 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified']


def is_city(edge):
    if "highway" in edge and edge["highway"] in city_highways:
        return True
    return False


def get_angle(a, b, c):
    ang = math.degrees(math.atan2(c[1] - b[1], c[0] - b[0]) - math.atan2(a[1] - b[1], a[0] - b[0]))
    return ang + 360 if ang < 0 else ang


def is_left_turn(G, source, mid, target):
    source_node = G.nodes[source]
    mid_node = G.nodes[mid]
    target_node = G.nodes[target]

    return 225 < get_angle(
        (source_node['x'], source_node['y']),
        (mid_node['x'], mid_node['y']),
        (target_node['x'], target_node['y']),
    )


def crossroad_without_traffic_signal(G, node):
    return len(G._adj[node]) > 3 and ("highway" in G.nodes[node] and G.nodes[node]["highway"] != "traffic_signals")


def is_roundabout(node):
    return "junction" in node and node["junction"] == "roundabout"


@dataclass()
class IncidentEntry:
    inc_id: int
    severity: int
    inc_type: int
    shortDesc: str
    lat: float
    lng: float


class IncidentProvider:
    def __init__(self):
        self._incidents: List[IncidentEntry] = list()

    def clear(self):
        self._incidents.clear()

    def fetch_incidents(self, a, b, c, d):
        url = "http://www.mapquestapi.com/traffic/v2/incidents"
        mapquest_key = "BGFBW3Gk3NZNBbDdk6MUM3zEoadG1lDC"
        bounding_box = "{},{},{},{}".format(a, b, c, d)
        filters = "construction,incidents"

        # sending get request and saving the response as response object
        r = requests.get(url=url, params={
            'key': mapquest_key,
            'boundingBox': bounding_box,
            'filters': filters
        })

        # extracting data in json format
        data = r.json()
        for inc in data['incidents']:
            inc_id = int(inc['id'])
            self._incidents.append(IncidentEntry(
                inc_id, inc['severity'], inc['type'], inc['shortDesc'], inc['lat'], inc['lng']
            ))

    def get_incidents(self) -> Tuple[List[float], List[float], List[float]]:
        def _float_cmp(a, b) -> int:
            d = a - b
            if abs(d) < 0.001:
                return 0
            return (1, -1)[a < b]

        def _is_close_point(x, y) -> bool:
            return _float_cmp(x.lat, y.lat) == 0 and _float_cmp(x.lng, y.lng) == 0

        ordered_incidents = sorted(self._incidents, key=lambda k: [k.lat, k.lng])
        length = len(ordered_incidents)

        res_lat, res_lng, res_severity = list(), list(), list()
        i = 0
        while i < length:
            sevevity = ordered_incidents[i].severity
            lat = ordered_incidents[i].lat
            lng = ordered_incidents[i].lng
            j = i
            i += 1
            while i < length and _is_close_point(ordered_incidents[i], ordered_incidents[j]):
                sevevity += ordered_incidents[i].severity
                i += 1
            res_lat.append(lat)
            res_lng.append(lng)
            res_severity.append(sevevity)
        return res_lat, res_lng, res_severity


def max_speed(edge):
    """Retrieves the speed limit for an edge"""

    maxspeed = 0
    if "maxspeed" in edge:
        if type(edge["maxspeed"]) == list:
            maxspeed = int(edge["maxspeed"][0])
        else:
            maxspeed = int(edge["maxspeed"])
    elif is_city(edge):
        maxspeed = 50
    else:
        maxspeed = 90
    return maxspeed


class SafestPlanner(planner.PlannerInterface):
    _OPTIONS = []

    @classmethod
    def internal_name(cls) -> str:
        return "safest_planner"

    @classmethod
    def display_name(cls) -> str:
        return "Safest route"

    @classmethod
    def description(cls) -> str:
        return "Plans the safest route between two points."

    @classmethod
    def fields_schema(cls) -> List[planner.OptionField]:
        return cls._OPTIONS

    def __init__(self, provider: OSMNXProvider):
        super().__init__(provider)
        place = 'Hungary, Budapest'
        self._G: nx.MultiDiGraph = self.provider.wrap(ox.graph_from_place, place, network_type='drive')

    @staticmethod
    def safest_weight(G, source, target, d, direction, prev_node=None):
        edge = d[0]
        danger_rate = 1
        hour = int(time.strftime("%H"))
        if is_city(edge) and 6 < hour < 20 or not is_city(edge) and (hour <= 6 or hour >= 20):
            danger_rate *= 2
        if prev_node is not None:
            if direction == 0:
                if is_left_turn(G, prev_node, source, target) and not is_roundabout(edge):
                    danger_rate *= 100
            else:
                if is_left_turn(G, target, source, prev_node) and not is_roundabout(edge):
                    danger_rate *= 100
        if crossroad_without_traffic_signal(G, target) and not is_roundabout(edge):
            danger_rate *= 100

        return (danger_rate * edge["length"]) / max_speed(edge)

    def plan(self, coord_from: Tuple[float, float], coord_to: Tuple[float, float], options: Dict) -> Optional[
        List[Tuple[float, float]]]:
        source_node = ox.nearest_nodes(self._G, coord_from[1], coord_from[0], return_dist=False)
        target_node = ox.nearest_nodes(self._G, coord_to[1], coord_to[0], return_dist=False)
        route = bidirectional_dijkstra(self._G, source_node, target_node, weight=SafestPlanner.safest_weight)
        route_coordinates = [(self._G.nodes[node]['y'], self._G.nodes[node]['x']) for node in route[1]]

        return route_coordinates


class RobustPlanner(planner.PlannerInterface):
    _OPTIONS = []

    @classmethod
    def internal_name(cls) -> str:
        return "robust_planner"

    @classmethod
    def display_name(cls) -> str:
        return "Robust route"

    @classmethod
    def description(cls) -> str:
        return "Plans the most robust route between two points."

    def _add_robustness(self, longitudes, latitudes, robustnesses):
        nodes = ox.nearest_nodes(self._G, longitudes, latitudes)
        for i in range(0, len(nodes)):
            for pred_node in self._G.predecessors(nodes[i]):
                self._G[pred_node][nodes[i]][0].update({"robustness": robustnesses[i]})

    def __init__(self, provider: OSMNXProvider):
        super().__init__(provider)
        place = 'Hungary, Budapest'
        self._G: nx.MultiDiGraph = self.provider.wrap(ox.graph_from_place, place, network_type='drive')

        # Budapest: 47.35, 18.8, 47.60, 19.4
        # Hungary: 45.74, 16.11, 48.58, 22.9
        self._incident_provider = IncidentProvider()
        self._incident_provider.fetch_incidents(47.35, 18.8, 47.60, 19.4)
        # self._incident_provider.fetch_incidents(45.74, 16.11, 48.58, 22.9)
        self._add_robustness(*self._incident_provider.get_incidents())

    @classmethod
    def fields_schema(cls) -> List[planner.OptionField]:
        return cls._OPTIONS

    @staticmethod
    def robust_weight(G, source, target, d, direction, prev_node=None):
        edge = d[0]
        robustness = 1
        if "robustness" in edge:
            robustness += edge["robustness"]
        return (robustness * edge["length"]) / max_speed(edge)

    def plan(self, coord_from: Tuple[float, float], coord_to: Tuple[float, float], options: Dict) -> Optional[
        List[Tuple[float, float]]]:
        source_node = ox.nearest_nodes(self._G, coord_from[1], coord_from[0], return_dist=False)
        target_node = ox.nearest_nodes(self._G, coord_to[1], coord_to[0], return_dist=False)
        route = bidirectional_dijkstra(self._G, source_node, target_node, weight=RobustPlanner.robust_weight)

        route_coordinates = [(self._G.nodes[node]['y'], self._G.nodes[node]['x']) for node in route[1]]

        return route_coordinates

