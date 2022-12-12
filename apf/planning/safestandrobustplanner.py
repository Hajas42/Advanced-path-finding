import networkx as nx
import osmnx as ox
import time
import sys
import math
import numpy as np
from heapq import heappop, heappush
from itertools import count
import requests
import geocoder
import mysql.connector #pip-hez mysql-connector-python
from typing import Tuple, Dict, List, Optional

from . import planner

#region Both

G = ox.graph_from_place('Budapest', network_type='drive')

def bidirectional_dijstra(G, source, target, weight="weight"):
    if source not in G or target not in G:
        msg = f"Either source {source} or target {target} is not in G"
        raise nx.NodeNotFound(msg)

    if source == target:
        return (0, [source])

    weight = _weight_function(G, weight)
    push = heappush
    pop = heappop
    # Init:  [Forward, Backward]ű
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
    # variables to hold shortest discovered path
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
                    cost = weight(v, w, d, dir, paths[dir][v][-2])
                else:
                    cost = weight(v, w, d, dir)
            else:
                if w in paths[dir] and len(paths[dir][w]) > 1:
                    cost = weight(w, v, d, dir, paths[dir][w][-2])
                else:
                    cost = weight(w, v, d, dir)
                    
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
    
def _weight_function(G, weight):
    
    if callable(weight):
        return weight
    # If the weight keyword argument is not callable, we assume it is a
    # string representing the edge attribute containing the weight of
    # the edge.
    if G.is_multigraph():
        return lambda u, v, d: min(attr.get(weight, 1) for attr in d.values())
    return lambda u, v, data: data.get(weight, 1)

#endregion

#region Safe

city_highways = ['living_street', 'primary', 'primary_link', 'residential',
                 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified']

def is_city(edge):
    if "highway" in edge and edge["highway"] in city_highways:
        return True
    return False

def getAngle(a, b, c):
    ang = math.degrees(math.atan2(c[1]-b[1], c[0]-b[0]) - math.atan2(a[1]-b[1], a[0]-b[0]))
    return ang + 360 if ang < 0 else ang

def is_left_turn(source, mid, target):
    source_node = G.nodes[source]
    mid_node = G.nodes[mid]
    target_node = G.nodes[target]
    
    return 225 < getAngle(
        (source_node['x'], source_node['y']),
        (mid_node['x'], mid_node['y']),
        (target_node['x'], target_node['y']),
        )

def crossroad_without_traffic_signal(node):
    return len(G._adj[node]) > 3 and ("highway" in G.nodes[node] and G.nodes[node]["highway"] != "traffic_signals")

def is_roundabout(node):
    return "junction" in node and node["junction"] == "roundabout"

def max_speed(edge):
    maxspeed = 0

    if "maxspeed" in edge:
        if type(edge["maxspeed"])==list:
            maxspeed = int(edge["maxspeed"][0])
        else:
            maxspeed = int(edge["maxspeed"])

    elif is_city(edge):
        maxspeed =  50

    else:
        maxspeed = 90

    return maxspeed

def safest_weight(source, target, d, dir, prev_node=None):
    edge = d[0]
    danger_rate = 1
    
    hour = int(time.strftime("%H"))
    
    if is_city(edge) and hour > 6 and hour < 20 or not is_city(edge) and (hour <= 6 or hour >= 20):
        danger_rate *= 2
    
    
    if prev_node != None:
        if dir == 0:
            if (is_left_turn(prev_node, source, target) and not is_roundabout(edge)):
                danger_rate *= 100
        else:
            if (is_left_turn(target, source, prev_node) and not is_roundabout(edge)):
                danger_rate *= 100
                
    if (crossroad_without_traffic_signal(target) and not is_roundabout(edge)):
        danger_rate *= 100

    return (danger_rate * edge["length"]) / max_speed(edge)

#endregion

#region Robust

dbip="84.3.12.243"

incdb = mysql.connector.connect(
host=dbip,
user="user",
password="1234",
database="incdatabase"
)
inccursor = incdb.cursor()

inccursor.execute("SELECT lat, lng, severity FROM incident ORDER BY lat")
    
st = inccursor.fetchall()
incdb.close()

def storeIncidents(a, b, c, d):

    incdb = mysql.connector.connect(
    host=dbip,
    user="user",
    password="1234",
    database="incdatabase"
    )
    inccursor = incdb.cursor()
    
    inccursor.execute("SELECT id FROM incident")

    storedincidents = inccursor.fetchall()
    
    sql = "INSERT INTO incident (id, severity, type, shortDesc, lat, lng ) VALUES (%s, %s, %s, %s, %s, %s)"
    
    URL = "http://www.mapquestapi.com/traffic/v2/incidents"
    mapquestKey = "BGFBW3Gk3NZNBbDdk6MUM3zEoadG1lDC"
    #budapest
    Box = "{},{},{},{}".format(a,b,c,d)
    Filter = "construction,incidents"

    # defining a params dict for the parameters to be sent to the API
    PARAMS = {'key':mapquestKey,'boundingBox':Box,'filters':Filter}

    # sending get request and saving the response as response object
    r = requests.get(url = URL, params = PARAMS)

    # extracting data in json format
    data = r.json()
    for inc in data['incidents']:
        found = 0
        for stored in storedincidents:
            if stored[0].find(inc['id']) != -1:

                found = 1
        if found == 0:
            val = (inc['id'], inc['severity'], inc['type'], inc['shortDesc'],inc['lat'],inc['lng'])
            inccursor.execute(sql, val)
    incdb.commit()
    incdb.close()
    return data

incidents = storeIncidents(47.35, 18.8, 47.60, 19.4)

def samepoint(x1,x2,y1,y2):
    if abs(float(x1)-float(x2)) < 0.001 and abs(float(y1)-float(y2)) < 0.001:
        return True
    else:
        return False

def StoredIncidents():
    incdb = mysql.connector.connect(
    host=dbip,
    user="user",
    password="1234",
    database="incdatabase"
    )
    inccursor = incdb.cursor()

    inccursor.execute("SELECT lat, lng, severity FROM incident ORDER BY lat")
    
    storedincidents = inccursor.fetchall()
    x = 0 
    list = []
    while x < len(storedincidents):
        sev = int(storedincidents[x][2])
        i = 1
        samepotential = True
        while x+i < len(storedincidents) and samepotential:
            if samepoint(storedincidents[x][0],storedincidents[x+i][0],storedincidents[x][1],storedincidents[x+i][1]):
                sev += int(storedincidents[x+i][2])
                i+=1
            else:
                samepotential = False
        list.append(tuple((storedincidents[x][0], storedincidents[x][1],sev)))
        x+=i
    incdb.close()
    return list

def add_robustness(Graph, longitudes, latitudes, robustnesses):
    nodes = ox.nearest_nodes(Graph, longitudes, latitudes)
    for i in range(0,len(nodes)):
        for pred_node in Graph.predecessors(nodes[i]):
            Graph[pred_node][nodes[i]][0].update({"robustness":robustnesses[i]})

def robust_weight(source, target, d, dir, prev_node=None):
    edge = d[0]
    robustness = 1

    if "robustness" in edge:
        robustness += edge["robustness"]

    return (robustness * edge["length"]) / max_speed(edge)

data_lon = []
data_lat = []
data_robust = []
for item in StoredIncidents():
    data_lon.append(float(item[0]))
    data_lat.append(float(item[1]))
    data_robust.append(int(item[2]))

add_robustness(G, data_lon, data_lat, data_robust)

#endregion

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

    def __init__(self):
        pass

    # def get_option_descriptions(self) -> List[PlannerOptionDescription]:
    #     pass
    #
    # def get_default_options(self) -> List[PlannerOptionDescription]:
    #     pass

    def plan(self, coord_from: Tuple[float, float], coord_to: Tuple[float, float], options: Dict) -> Optional[List[Tuple[float, float]]]:
        source_node = ox.nearest_nodes(G, coord_from[1], coord_from[0], return_dist=False)
        target_node = ox.nearest_nodes(G, coord_to[1], coord_to[0], return_dist=False)
        route = bidirectional_dijstra(G, source_node, target_node, weight=safest_weight)
        route_coordinates = [(G.nodes[node]['y'], G.nodes[node]['x']) for node in route[1]]

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

    def __init__(self):
        pass

    @classmethod
    def fields_schema(cls) -> List[planner.OptionField]:
        return cls._OPTIONS
    # def get_option_descriptions(self) -> List[PlannerOptionDescription]:
    #     pass
    #
    # def get_default_options(self) -> List[PlannerOptionDescription]:
    #     pass

    def plan(self, coord_from: Tuple[float, float], coord_to: Tuple[float, float], options: Dict) -> Optional[List[Tuple[float, float]]]:
        source_node = ox.nearest_nodes(G, coord_from[1], coord_from[0], return_dist=False)
        target_node = ox.nearest_nodes(G, coord_to[1], coord_to[0], return_dist=False)
        route = bidirectional_dijstra(G, source_node, target_node, weight=robust_weight)

        route_coordinates = [(G.nodes[node]['y'], G.nodes[node]['x']) for node in route[1]]

        return route_coordinates