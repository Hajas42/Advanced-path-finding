from flask import Flask, render_template, request, jsonify
import os
import requests


app = Flask(__name__, template_folder="./templates")
app.config["GOOGLEMAPS_KEY"] = os.environ.get("GOOGLEMAPS_KEY")


@app.route("/api/test/<name>")
def api_test(name):
    base_resp = {
        "response": f"Hello {name}!",
    }

    location_received = request.args.get("location")
    if location_received:
        base_resp["location"] = f"Your location is: {location_received}"

    return jsonify(base_resp)


@app.route("/")
def main_view():
    return render_template('base.html', title="Test app")


def main():
    app.run(debug=True)


if __name__ == "__main__":
    main()

