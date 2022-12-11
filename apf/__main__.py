import base64
import json
import binascii

from flask import Flask, render_template, request, jsonify
from typing import Dict, Tuple
import os
import requests
from .geocoding.nominatim_geocoder import NominatimGeocoder
from .planning import PlannerInterface, DrunkPilotPlanner


app = Flask(__name__, template_folder="./templates")

geocoder = NominatimGeocoder()
planners: Dict[str, PlannerInterface] = {
    DrunkPilotPlanner.internal_name(): DrunkPilotPlanner()
}


@app.route("/api/geocoding")
def api_geocoding():
    error_reason = "unknown"
    location = request.args.get("location")
    if location is not None and type(location) is str:
        location_resolved = geocoder.geocode(location, 1)
        if len(location_resolved) >= 1:
            return jsonify({
                "status": "ok",
                "lat": location_resolved[0].lat,
                "lon": location_resolved[0].lon,
                "name": location_resolved[0].name
            })
        else:
            error_reason = "could not resolve location"
    else:
        error_reason = "missing location parameter"

    return jsonify({
        "status": "error",
        "reason": error_reason
    })


@app.route("/api/reverse")
def api_reverse():
    error_reason = "unknown"
    lat = float(request.args.get("lat"))
    lon = float(request.args.get("lon"))
    if lat is not None and lon is not None:
        location_resolved = geocoder.reverse((lat, lon))
        if location_resolved is not None:
            return jsonify({
                "status": "ok",
                "lat": location_resolved.lat,
                "lon": location_resolved.lon,
                "name": location_resolved.name
            })
        else:
            error_reason = "could not resolve location"
    else:
        error_reason = "missing location parameter"

    return jsonify({
        "status": "error",
        "reason": error_reason
    })


@app.route("/api/autocomplete")
def api_autocomplete():
    error_reason = "unknown"
    query = request.args.get("query")
    if query:
        locations = geocoder.geocode(query, 5)
        if len(locations) >= 1:
            # TODO: sorting might be unnecessary
            return jsonify({
                "status": "ok",
                "locations": [
                    {
                        "lat": loc.lat,
                        "lon": loc.lon,
                        "importance": loc.importance,
                        "name": loc.name
                    } for loc in sorted(locations, key=lambda a, b: a.importance > b.importance)
                ]
            })
        else:
            error_reason = "could not resolve location"
    else:
        error_reason = "missing location parameter"

    return jsonify({
        "status": "error",
        "reason": error_reason
    })


@app.route("/api/methods")
def api_methods():
    return jsonify({
        "status": "ok",
        "methods": [{
            "name": name,
            "display_name": planner.display_name(),
            "description": planner.description(),
            # "options": [dataclasses.asdict(desc) for desc in planner.get_option_descriptions()]
            "fields": [(field.type_name, field) for field in planner.get_option_descriptions()]
        } for name, planner in planners.items()
        ]
    })


@app.route("/api/route")
def api_route():
    query_from = request.args.get("from")
    query_to = request.args.get("to")
    query_method = request.args.get("method")
    query_options = request.args.get("options")
    if any(not isinstance(x, str) for x in (query_from, query_to, query_method, query_options)) or query_method not in planners:
        return jsonify({
            "status": "error",
            "reason": "invalid input"
        })

    def _parse_coords(r) -> Tuple[float, float]:
        r = r.split("|", 1)
        if len(r) != 2:
            raise ValueError
        return float(r[0]), float(r[1])

    try:
        coords_from = _parse_coords(query_from)
        coords_to = _parse_coords(query_to)
        options_dict = json.loads(base64.b64decode(query_options).decode())
        good_keys = {x.name: x for x in planners[query_method].get_option_descriptions()}
        if any(not isinstance(k, str) or k not in good_keys or not isinstance(v, good_keys[k].value_type) for k, v in options_dict.items()) or len(good_keys) != len(options_dict):
            raise ValueError
    except (ValueError, json.decoder.JSONDecodeError, binascii.Error, UnicodeDecodeError) as e:
        return jsonify({
            "status": "error",
            "reason": "invalid format"
        })

    print(options_dict)
    coords = planners[query_method].plan(coords_from, coords_to, options_dict)
    if coords is None:
        return jsonify({
            "status": "error",
            "coords": "could not plan journey"
        })

    return jsonify({
        "status": "ok",
        "coords": coords
    })


@app.route("/")
def main_view():
    return render_template('base.html', title="Advanced Path Finding")


def main():
    app.run(debug=True)


if __name__ == "__main__":
    main()

