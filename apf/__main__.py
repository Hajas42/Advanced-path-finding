import time

import jsonschema
import osmnx.geometries

from flask import Flask, render_template, request, jsonify
from typing import Dict, Tuple
from .geocoding.nominatim_geocoder import NominatimGeocoder
from .planning import PlannerInterface, DrunkPilotPlanner, SafestPlanner, RobustPlanner, TouristRoutePlanner
from .osmnx_provider import OSMNXProvider


app = Flask(__name__, template_folder="./templates")

# ---------------------------------------------
# --- APF setup
# ---------------------------------------------

# --- OSMNX provider
provider = OSMNXProvider()

# --- Geocoding interface
geocoder = NominatimGeocoder()

# --- Planners
planners: Dict[str, PlannerInterface] = {}


def register_planner(planner):
    planners[planner.internal_name()] = planner


register_planner(DrunkPilotPlanner(provider))
register_planner(SafestPlanner(provider))
register_planner(RobustPlanner(provider))
register_planner(TouristRoutePlanner(provider))

# ---------------------------------------------
# --- FLASK
# ---------------------------------------------


@app.route("/api/geocoding", methods=["GET"])
def api_geocoding():
    location = request.args.get("location")
    if not isinstance(location, str):
        return jsonify({
            "status": "error",
            "reason": "missing or malformed location parameter"
        })

    location_resolved = geocoder.geocode(location, 1)
    if len(location_resolved) >= 1:
        return jsonify({
            "status": "ok",
            "lat": location_resolved[0].lat,
            "lon": location_resolved[0].lon,
            "name": location_resolved[0].name
        })
    else:
        return jsonify({
            "status": "error",
            "reason": "could not resolve location"
        })


@app.route("/api/reverse", methods=["GET"])
def api_reverse():
    try:
        lat = float(request.args.get("lat"))
        lon = float(request.args.get("lon"))
    except (ValueError, TypeError):
        return jsonify({
            "status": "error",
            "reason": "missing or malformed coordinate parameters"
        })
    location_resolved = geocoder.reverse((lat, lon))
    if location_resolved is not None:
        return jsonify({
            "status": "ok",
            "lat": location_resolved.lat,
            "lon": location_resolved.lon,
            "name": location_resolved.name
        })
    else:
        return jsonify({
            "status": "error",
            "reason": "could not resolve location"
        })


@app.route("/api/autocomplete", methods=["GET"])
def api_autocomplete():
    query = request.args.get("query")
    if not isinstance(query, str):
        return jsonify({
            "status": "error",
            "reason": "missing or malformed query parameter"
        })

    locations_resolved = geocoder.geocode(query, 5)
    if len(locations_resolved) >= 1:
        # TODO: sorting might be unnecessary
        return jsonify({
            "status": "ok",
            "locations": [
                {
                    "lat": loc.lat,
                    "lon": loc.lon,
                    "importance": loc.importance,
                    "name": loc.name
                } for loc in sorted(locations_resolved, key=lambda a: a.importance, reverse=True)
            ]
        })
    else:
        return jsonify({
            "status": "error",
            "reason": "could not resolve query"
        })


@app.route("/api/config", methods=["GET"])
def api_config():
    return jsonify({
        "status": "ok",
        # TODO: cache this somehow / transfer this to the client in a more clever way
        "bounds": list(zip(*osmnx.geocode_to_gdf({"country": "Hungary"}).iloc[0]["geometry"].exterior.coords.xy[::-1])),
        "planners": [{
            "name": name,
            "display_name": planner.display_name(),
            "description": planner.description(),
            "fields": [(field.type_name, field) for field in planner.fields_schema()]
        } for name, planner in planners.items()
        ]
    })


_SCHEMA_COORDINATE = {
    "type": "object",
    "properties": {
        "lat": {"type": "number"},
        "lon": {"type": "number"}
    }
}


_SCHEMA_ROUTE = {
    "type": "object",
    "properties": {
        "from": _SCHEMA_COORDINATE,
        "to": _SCHEMA_COORDINATE,
        "planner": {"type": "string"},
        "fields": {"type": "object"}
    }
}


@app.route("/api/plan", methods=["POST"])
def api_route():
    json_data = request.json
    try:
        jsonschema.validate(instance=json_data, schema=_SCHEMA_ROUTE)
    except jsonschema.exceptions.ValidationError:
        return jsonify({
            "status": "error",
            "reason": "malformed input"
        })

    planner_name = json_data["planner"]
    if planner_name not in planners:
        return jsonify({
            "status": "error",
            "reason": "unknown planner"
        })
    planner = planners[planner_name]

    fields = json_data["fields"]
    fields_schema = {x.name: x for x in planner.fields_schema()}
    if len(fields_schema) != len(fields) or any(
            name not in fields_schema or not fields_schema[name].validate_value(value) for name, value in
            fields.items()):
        return jsonify({
            "status": "error",
            "reason": "malformed fields"
        })

    coords_from = json_data["from"]["lat"], json_data["from"]["lon"]
    coords_to = json_data["to"]["lat"], json_data["to"]["lon"]

    final_plan = planner.plan(coords_from, coords_to, fields)
    if final_plan is None:
        return jsonify({
            "status": "error",
            "coords": "could not plan journey"
        })

    return jsonify({
        "status": "ok",
        "plan_status": int(final_plan.status),
        "waypoints": final_plan.waypoints
    })


@app.route("/")
def main_view():
    return render_template('base.html', title="Advanced Path Finding")


def main():
    app.run(debug=True)


if __name__ == "__main__":
    main()

