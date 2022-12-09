var mapWrapper = (function() {
    var o = {};
    o.myPublicProperty = 0;

    let map;  // the global map object
    let currentPosMarker = null;
    let searchFormFrom = null;
    let searchFormTo = null;
    let methodOptions = null;
    let buttonPlan = null;
    let buttonClear = null;
    let routeLine = null;

    let PositionRadiusMarker = class {
        constructor(latlng, radius) {
            this.circle = L.circle(latlng, radius, {
                stroke: true,
                strokeColor: "#3388ff",
                fill: true,
                fillColor: "#3388ff",
                fillOpacity: 0.2
            }).addTo(map);

            this.marker = L.circle(latlng, 1, {
                stroke: true,
                strokeColor: "#3388ff",
                fill: true,
                fillColor: "#ffffff",
                fillOpacity: 1.0
            }).addTo(map);

            this._latlng = latlng;
            this._radius = radius;

            let popupMsg = "Your current location.";
            this.circle.bindPopup(popupMsg);
            this.marker.bindPopup(popupMsg);
        }

        get latlng() {
            return this._latlng;
        }

        get radius() {
            return this._latlng;
        }

        updatePosition(latlng, radius) {
            this._latlng = latlng;
            this._radius = radius;
            this.circle.setLatLng(latlng);
            this.circle.setRadius(radius);
            this.marker.setLatLng(latlng);
        }
    }

    let SearchForm = class {
        static selectedLocationForm = null;

        constructor(formId, inputId, locationId, markerIconUrl) {
            this.formDom = $(formId);
            this.inputDom = this.formDom.find(inputId);
            this.locationDom = this.formDom.find(locationId);

            this._marker_icon = new L.icon({
                iconUrl: markerIconUrl,
                iconSize: [25, 41],
                iconAnchor: [12, 41]
            });
            this.marker = null;
            this._form_ctx = {
                form: this
            }
            this._latlng = null;
            this._xhr_stamp = 0;  // so we can ignore older XHR results

            // this._locationLatlng = null;

            // setup events
            this.formDom.bind("submit", this._form_ctx, this.onSubmit);
            this.inputDom.bind("change", this._form_ctx, this.onInputChange);
            this.locationDom.bind("click", this._form_ctx, this.onLocationClick);
        }

        get latlng() {
            return this._latlng;
        }

        _locationButtonDeselect() {
            map.off("click", this.onMapClick, this);
            this.locationDom.removeClass("sidebar-location-selected");
            L.DomUtil.removeClass(map._container, 'crosshair-cursor-enabled');
            SearchForm.selectedLocationForm = null;
        }

        _locationButtonSelect(select) {
            SearchForm.selectedLocationForm = this;
            this.locationDom.addClass("sidebar-location-selected");
            L.DomUtil.addClass(map._container, 'crosshair-cursor-enabled');
            map.on("click", this.onMapClick, this);
        }

        onLocationClick(e) {
            if (SearchForm.selectedLocationForm === e.data.form) {
                e.data.form._locationButtonDeselect();
            } else {
                if (SearchForm.selectedLocationForm !== null)
                    SearchForm.selectedLocationForm._locationButtonDeselect();
                e.data.form._locationButtonSelect();
            }
        }

        onInputChange(e) {
            // TODO: autocomplete
        }

        onSubmit(e) {
            e.preventDefault();
            requestGeocoding(e.data.form.inputDom.val(), function(result) {
                if (result["status"] === "ok") {
                    e.data.form.inputDom.val(result["name"]);
                    let latlng = L.latLng(result["lat"], result["lon"])
                    e.data.form.markerPlaceAt(latlng);
                    map.flyTo(latlng, 16);
                }
            });
        }

        onMapClick(e) {
            console.log("Click: " + e.latlng.lat + ", " + e.latlng.lng);

            this._locationButtonDeselect();
            this.markerPlaceAt(e.latlng);

            // Look up what's this place called and correct the marker's position
            let stamp = ++this._xhr_stamp;  // Allocate new stamp
            let form = this;    // so the lambda may bind to this
            requestReverse(e.latlng, function(result) {
                // outdated request
                if (form._xhr_stamp !== stamp)
                    return;
                if (result["status"] === "ok") {
                    form.inputDom.val(result["name"]);
                    let latlng = L.latLng(result["lat"], result["lon"]);
                    form.markerPlaceAt(latlng);
                }
            });

            // TODO: get the name from the coords
        }

        markerRemove() {
            this._latlng = null;
            if (this.marker !== null) {
                map.removeLayer(this.marker);
                this.marker = null;
            }
        }

        markerPlaceAt(latlng) {
            this._latlng = latlng;
            if (this.marker === null) {
                this.marker = L.marker(latlng, {icon: this._marker_icon}).addTo(map);
            }
            this.marker.setLatLng(latlng);
        }
    }

    function flyToHome() {
        if (currentPosMarker !== null) {
            map.flyTo(currentPosMarker.latlng, 16);
        }
    }

    function locationFoundCallback(e) {
        console.log("Location: ", e.latitude, e.longitude, e.accuracy);

        // Init the marker for the current position (if it has not been)
        if (currentPosMarker == null) {
            currentPosMarker = new PositionRadiusMarker(e.latlng, e.accuracy);

            // Set the view of the map to this locaiton
            map.flyTo(e.latlng, 16);

        } else {
            // Else just update the positions
            currentPosMarker.updatePosition(e.latlng, e.accuracy);
        }
    }

    function locationErrorCallback(e) {
        console.log("Location access was denied.");

        map.stopLocate();
    }

    function requestGeocoding(query, callback) {
        $.ajax({
            url: "/api/geocoding",
            type: "get",
            dataType: "json",
            data: {
                "location": query
            },
        }).done(callback);
    }

    function requestReverse(latlng, callback) {
        $.ajax({
            url: "/api/reverse",
            type: "get",
            dataType: "json",
            data: {
                "lat": latlng.lat,
                "lon": latlng.lng
            },
        }).done(callback);
    }

    function requestAutocomplete(query, callback) {
        $.ajax({
            url: "/api/autocomplete",
            type: "get",
            dataType: "json",
            data: {
                "query": query,
            },
        }).done(callback);
    }

    function requestMethods(callback) {
        $.ajax({
            url: "/api/methods",
            type: "get",
            dataType: "json",
        }).done(callback);
    }

    function requestRoute(from_latlng, to_latlng, method, callback) {
        $.ajax({
            url: "/api/route",
            type: "get",
            dataType: "json",
            data: {
                "from": from_latlng.lat + "|" + from_latlng.lng,
                "to": to_latlng.lat + "|" + to_latlng.lng,
                "method": method
            },
        }).done(callback);
    }

    // ------------

    function methodsCallback(result) {
        if (result["status"] === "ok" && result["methods"].length > 0) {
            console.log(result);
            // Add the methods

            $.each(result["methods"], function(k, method) {
                console.log(method);
                methodOptions.append($('<option>', {
                    value: method["name"],
                    title: method["description"],
                    text: method["display_name"]
                }));
            });
        } else {
            // TODO: a massive error message
        }
    }

    function addRoute(latlngs) {
        clearRoute();
        routeLine = L.polyline(
            latlngs,
            {color: 'blue'}
        ).addTo(map);
    }

    function clearRoute() {
        if (routeLine !== null) {
            map.removeLayer(routeLine);
            routeLine = null;
        }
    }

    function onPlan(e) {
        from = searchFormFrom.latlng;
        to = searchFormTo.latlng;
        method = methodOptions.val();

        if (from === null || to === null) {
            alert("Choose a starting end ending point first");
            return;
        }

        if (method === "") {
            alert("Choose a method first");
            return;
        }

        buttonPlan.prop('disabled', true);
        buttonClear.prop('disabled', true);
        requestRoute(from, to, method, function (result){
            console.log(result);
            if (result["status"] === "ok") {
                addRoute(result["coords"]);
            }
            buttonPlan.prop('disabled', false);
            buttonClear.prop('disabled', false);
        });
    }

    function onClear(e) {
        clearRoute();
    }

    function initMap() {
        // Initialize the map object (default location is Budapest)
        map = L.map("map", {
            center: [47.4979, 19.0402],
            zoom: 13,
            zoomControl: false
        });

        L.control.zoom({
            position: "bottomright"
        }).addTo(map);

        // Add tiles
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);

        let homeButton = new L.Control.HomeButton({
            position: "bottomright",
            onClick: flyToHome
        });
        homeButton.addTo(map);

        // Set up events
        map.on("locationfound", locationFoundCallback);
        map.on("locationerror", locationErrorCallback);

        // Try fetching the user"s location
        map.locate({watch: true});

        // Search bars
        searchFormFrom = new SearchForm("#sidebar-from-form", "#sidebar-from-input", "#sidebar-from-location", "static/img/marker-icon-green.png");
        searchFormTo = new SearchForm("#sidebar-to-form", "#sidebar-to-input", "#sidebar-to-location", "static/img/marker-icon-red.png");

        // Request the methods
        methodOptions = $("#sidebar-methodselect");
        requestMethods(methodsCallback);

        buttonPlan = $("#sidebar-button-plan");
        buttonPlan.click(onPlan);
        buttonClear = $("#sidebar-button-clear");
        buttonClear.click(onClear);

        console.log("initialized map!");
    }

    $(document).ready(function () {
        console.log("ready!");

        initMap();
    });

    return o;
})();

