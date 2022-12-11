var mapWrapper = (function() {
    var o = {};

    let map;  // the global map object
    let currentPosMarker = null;
    let searchFormFrom = null;
    let searchFormTo = null;
    let methodList = null;
    let methodOptionsContainer = null;
    let buttonPlan = null;
    let routesTable = null;

    class PositionRadiusMarker {
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

        /**
         * The current coordinate of the marker.
         */
        get latlng() {
            return this._latlng;
        }

        /**
         * The radius of the marker.
         */
        get radius() {
            return this._latlng;
        }

        /**
         * Update the position of the marker.
         * @param {L.latlng} latlng the coordinate
         * @param {int}      radius the radius
         */
        updatePosition(latlng, radius) {
            this._latlng = latlng;
            this._radius = radius;
            this.circle.setLatLng(latlng);
            this.circle.setRadius(radius);
            this.marker.setLatLng(latlng);
        }
    }

    class SearchForm {
        /** The currently selected form, if any */
        static _selectedLocationForm = null;

        /**
         * Constructs a search form an already existing DOM structure. (So pretty much it just riggs up the events)
         * @param {*}      formElement   the form DOM object / jQuery selector / id as a string
         * @param {String} markerIconUrl the Url for the marker
         * @param {String} buttonColor   the color for the marker inside the location button in a css friendly form
         * @param {String} placeholder   the placeholder text for the input field
         */
        constructor(formElement, markerIconUrl, buttonColor, placeholder) {
            this.formDom = $(formElement);
            this.inputDom = this.formDom.find(".sidebar-search-input");
            this.locationDom = this.formDom.find(".sidebar-search-location");

            this.locationDom.css('color', buttonColor);
            this.inputDom.prop('placeholder', placeholder);

            this._marker_icon = new L.icon({
                iconUrl: markerIconUrl,
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [0, -30]
            });
            this.marker = null;
            this._form_ctx = {form: this};
            this._latlng = null;
            this._location_name = null;
            this._xhr_stamp = 0;  // so we can ignore older XHR results

            // Set up the events
            this.formDom.bind("submit", this._form_ctx, this._onSubmit);
            this.inputDom.bind("change", this._form_ctx, this._onInputChange);
            this.locationDom.bind("click", this._form_ctx, this._onLocationClick);
        }

        /**
         * Constructs a search form HTML.
         * @returns a search form
         */
        static constructFormElement() {
            // TODO: is there a nicer way of doing this?
            return $('<form id="sidebar-from-form" class="sidebar-element sidebar-search sidebar-roundinside">')
                    .append('<input class="sidebar-search-input" type="text" name="search" />')
                    .append('<button class="sidebar-button sidebar-search-location" type="button"><i class="fa fa-location-dot"></i></button>')
                    .append('<button class="sidebar-button sidebar-search-submit" type="submit"><i class="fa fa-search"></i></button>');
        }

        /**
         * The current coordinate of the placed marker. If there is not a marker placed, the result will be null.
         */
        get latlng() {
            return this._latlng;
        }

        get location_name() {
            return this._location_name;
        }

        /**
         * Exits the location selection mode.
         */
        _locationButtonDeselect() {
            if (SearchForm._selectedLocationForm !== this) {
                console.log("Selected SearchForm invariant is violated!");
                return;
            }

            map.off("click", this._onMapClick, this);
            this.locationDom.removeClass("sidebar-location-selected");
            L.DomUtil.removeClass(map._container, 'crosshair-cursor-enabled');
            SearchForm._selectedLocationForm = null;
        }

        /**
         * Enters the location selection mode.
         */
        _locationButtonSelect() {
            // Deselect any search form previously selected
            if (SearchForm._selectedLocationForm !== null)
                SearchForm._selectedLocationForm._locationButtonDeselect();

            SearchForm._selectedLocationForm = this;
            this.locationDom.addClass("sidebar-location-selected");
            L.DomUtil.addClass(map._container, 'crosshair-cursor-enabled');
            map.on("click", this._onMapClick, this);
        }

        /**
         * A callback for when the location selection button is clicked.
         * @param {*} e event parameter
         */
        _onLocationClick(e) {
            if (SearchForm._selectedLocationForm === e.data.form) {
                // Clicking again on select means the user wants to exit out of locaiton selection mode.
                e.data.form._locationButtonDeselect();
            } else {                
                e.data.form._locationButtonSelect();
            }
        }

        /**
         * A callback for when the address search bar's content is modified.
         * @param {*} e event parameter
         */
        _onInputChange(e) {
            // TODO: autocomplete
        }

        /**
         * A callback for when either the user searches for a locaiton (either by clicking on the search button or pressing enter)
         * @param {*} e event parameter
         */
        _onSubmit(e) {
            // Prevent the actual HTML form reloading the page
            e.preventDefault();

            // Geocode the location and update the location based on the result
            requestGeocoding(e.data.form.inputDom.val(), function(result) {
                if (result["status"] === "ok") {
                    e.data.form.inputDom.val(result["name"]);
                    let latlng = L.latLng(result["lat"], result["lon"])
                    e.data.form.markerPlaceAt(latlng);
                    map.flyTo(latlng, 16);
                }
            });
        }

        /**
         * A callback for when the user clicks on the map.
         * @param {*} e event parameter
         */
        _onMapClick(e) {
            // Leave the selection mode
            this._locationButtonDeselect();

            // Place an initial marker
            this.markerPlaceAt(e.latlng);

            // Look up what's this place called and adjust the marker's position
            let stamp = ++this._xhr_stamp;  // Allocate new stamp
            let form = this;    // ... so the lambda may bind to this (whe cannot access 'this' inside the lambda)
            requestReverse(e.latlng, function(result) {
                // Check for an outdated request
                //  This happens when the user quickly selects another location, before the reverse lookup's result arrive
                //  TODO: we could maybe save the ajax object and call a cancel on that whenever this happens
                if (form._xhr_stamp !== stamp)
                    return;

                if (result["status"] === "ok") {
                    const latlng = L.latLng(result["lat"], result["lon"]);
                    const name = result["name"];
                    form.inputDom.val(result["name"]);
                    form.markerPlaceAt(latlng, name);
                }
            });
        }

        /**
         * Removes the marker from the map.
         */
        markerRemove() {
            this._latlng = null;
            if (this.marker !== null) {
                map.removeLayer(this.marker);
                this.marker = null;
            }
        }

        /**
         * Places a marker at the given coordinate.
         * @param {L.latlng} latlng         the coordinate
         * @param {String}   location_name  optionally, the name of the place
         */
        markerPlaceAt(latlng, location_name) {
            this._latlng = latlng;
            if (location_name == null)
                location_name = latlng.lat + ", " + latlng.lng;
            this._location_name = location_name;
            if (this.marker === null) {
                this.marker = L.marker(latlng, {icon: this._marker_icon}).addTo(map);
                this.marker.bindPopup(location_name);
            }
            this.marker.setLatLng(latlng);
            this.marker._popup.setContent(location_name);
        }
    }

    class Route {
        static _colorCounter = 0;

        // https://stackoverflow.com/questions/10014271/generate-random-color-distinguishable-to-humans
        static nextColor() {
            const hue = Route._colorCounter++ * 137.508; // use golden angle approximation
            return `hsl(${hue},100%,30%)`;
        }

        static routes = new Set();

        static addRoute(name, waypoints, description, lineColor) {
            return new Route(name, waypoints, description, lineColor)
        }

        constructor(name, waypoints, description, lineColor) {
            this._name = name;
            this._description = description || "";

            if (lineColor == null) {
                lineColor = Route.nextColor();
            }

            // Line on map
            this._routeStyle = {
                color: lineColor,
                weight: 3
            };
            this._routeHighlightedStyle = {
                color: lineColor,
                weight: 6
            };
            this._routeLine = L.polyline(waypoints, this._routeStyle).addTo(map);
            this._routeLine.bindPopup("");
            this._updatePopup();
            this._routeLine.on('mouseover', this._onRouteLineMouseOver, this);
            this._routeLine.on('mouseout', this._onRouteLineMouseOut, this);

            // Sidebar entry
            this._entry_ctx = {entry: this};
            this._entryName = $('<input type="text" value="" />');
            this._entryNameContainer = $('<div class="sidebar-table-cell sidebar-route-name"></div>').append(this._entryName);
            this._entryLine = $('<div></div>')
            this._entryLineContainer = $('<div class="sidebar-table-cell sidebar-route-line"></div>').append(this._entryLine);
            this._entryRemove = $('<button type="button"><i class="fa fa-times" aria-hidden="true"></i></button>');
            this._entryRemoveContainer = $('<div class="sidebar-table-cell sidebar-route-remove"></button></div>').append(this._entryRemove);
            this._entryRow = $('<div class="sidebar-table-row sidebar-routes-row">').append(this._entryNameContainer).append(this._entryLineContainer).append(this._entryRemoveContainer);

            this._entryName.bind("focusout", this._entry_ctx, this._onRouteEntryNameFocusout);
            this._entryRow.bind("mouseenter", this._entry_ctx, this._onRouteEntryMouseEnter);
            this._entryRow.bind("mouseleave", this._entry_ctx, this._onRouteEntryMouseLeave);
            this._entryLineContainer.bind("click", this._entry_ctx, this._onRouteEntryLineClick);
            this._entryRemove.bind("click", this._entry_ctx, this._onRemoveClicked);

            this._entryName.val(name);
            this._entryLine.css('background', lineColor);
            routesTable.append(this._entryRow);

            Route.routes.add(this);
        }

        _updatePopup() {
            let title = $('<h3></h3>');
            title.text(this._name);
            let description = $('<p></p>');
            description.text(this._description);

            this._routeLine._popup.setContent($('<div></div>').append(title).append(description).get(0));
        }

        _onRouteEntryNameFocusout(e) {
            e.data.entry._name = e.data.entry._entryName.val();
            e.data.entry._updatePopup();
        }

        _highlightEnable() {
            this._routeLine.setStyle(this._routeHighlightedStyle);
        }

        _highlightDisable() {
            this._routeLine.setStyle(this._routeStyle);
        }

        _onRouteEntryLineClick(e) {
            map.fitBounds(e.data.entry._routeLine.getBounds());
            e.data.entry._routeLine.openPopup();
        }

        _onRouteEntryMouseEnter(e) {
            e.data.entry._highlightEnable();
        }

        _onRouteEntryMouseLeave(e) {
            e.data.entry._highlightDisable();
        }

        _onRouteLineMouseOver(e) {
            this._highlightEnable();
        }

        _onRouteLineMouseOut(e) {
            this._highlightDisable();
        }

        remove() {
            this._entryRow.remove();
            map.removeLayer(this._routeLine);
            Route.routes.delete(this);
        }

        _onRemoveClicked(e) {
            e.data.entry.remove();
        }
    }

    class OptionField {
        constructor(name, displayName, description) {
            this.name = name;
            this.displayName = displayName;
            this.description = description;

            
            this._rowLabel = $('<label class="sidebar-table-cell sidebar-option-name"></label>');
            this._rowFieldCell = $('<div class="sidebar-table-cell sidebar-option-field">');
            this._row = $('<div class="sidebar-table-row sidebar-options-row">').append(this._rowLabel, this._rowFieldCell);

            this._rowLabel.text(displayName);
            this._rowLabel.prop("title", description);
        }

        get row() {
            return this._row;
        }

        get rowFieldCell() {
            return this._rowFieldCell;
        }
    }

    class OptionFieldSelect extends OptionField {
        constructor(name, displayName, description, values, defaultValue) {
            super(name, displayName, description);
            this._fieldSelect = $('<select></select>');
            for (let i = 0; i < values.length; ++i) {
                let option = $('<option></option>');
                option.prop("value", values[i].name);
                option.text(values[i].display_name);
                this._fieldSelect.append(option);
            }
            if (defaultValue != null)
                this._fieldSelect.val(defaultValue);
            this.rowFieldCell.append(this._fieldSelect);
        }

        get value() {
            return this._fieldSelect.val();
        }

        set value(val) {
            return this._fieldSelect.val(val);
        }
    }

    class OptionFieldCheckbox extends OptionField {
        constructor(name, displayName, description, defaultValue) {
            super(name, displayName, description);
            this._fieldCheckbox = $('<input type="checkbox">');
            if (defaultValue != null)
                this._fieldCheckbox.prop('checked', defaultValue);
            this.rowFieldCell.append(this._fieldCheckbox);
        }

        get value() {
            return Boolean(this._fieldCheckbox.prop('checked'));
        }

        set value(val) {
            return this._fieldCheckbox.prop('checked', val);
        }
    }

    class OptionFieldNumber extends OptionField {
        constructor(name, displayName, description, defaultValue, minValue, maxValue) {
            super(name, displayName, description);
            this._fieldNumber = $('<input type="number">');
            if (minValue != null)
                this._fieldNumber.prop("min", minValue);
            if (maxValue != null)
                this._fieldNumber.prop("max", maxValue);
            this._fieldNumber.val(defaultValue);
            this.rowFieldCell.append(this._fieldNumber);
        }

        get value() {
            return parseInt(this._fieldNumber.val());
        }

        set value(val) {
            return this._fieldNumber.val(val);
        }
    }

    class OptionFieldRange extends OptionField {
        constructor(name, displayName, description, defaultValue, minValue, maxValue) {
            super(name, displayName, description);
            this._fieldRange = $('<input type="range">');
            if (minValue != null)
                this._fieldRange.prop("min", minValue);
            if (maxValue != null)
                this._fieldRange.prop("max", maxValue);
            this._fieldRange.val(defaultValue);
            this.rowFieldCell.append(this._fieldRange);
        }

        get value() {
            return parseInt(this._fieldRange.val());
        }

        set value(val) {
            return this._fieldRange.val(val);
        }
    }

    class MethodOptions {
        static _selectedMethodOptions = null;

        static methodOptions = new Map();

        static addMethodOptions(name, display_name, description, fields) {
            return new MethodOptions(name, display_name, description, fields)
        }

        constructor(name, display_name, description, fields) {
            this.name = name;
            this.display_name = display_name;
            this.description = description;
            
            this._methodListElement = $('<option>', {
                value: name,
                title: display_name,
                text: description
            });
            methodList.append(this._methodListElement);
            console.log(methodList);

            this._optionsElement = $('<div class="sidebar-table sidebar-options"></div>');
            this._optionsElement.hide();
            this.fields = fields;
            this.fields.forEach(field => {
                this._optionsElement.append(field.row);
            });
            methodOptionsContainer.append(this._optionsElement);

            MethodOptions.methodOptions.set(name, this);
        }

        valuesToJson() {
            let json = {}
            this.fields.forEach(field => {
                json[field.name] = field.value;
            });
            return json;
        }

        hide() {
            if (MethodOptions._selectedMethodOptions === this) {
                MethodOptions._selectedMethodOptions = null;
            }
            this._optionsElement.hide();
        }

        show () {
            if (MethodOptions._selectedMethodOptions !== null) {
                MethodOptions._selectedMethodOptions.hide();
            }
            MethodOptions._selectedMethodOptions = this;
            this._optionsElement.show();
        }

        remove() {
            this._methodListElement.remove();
            this._optionsElement.remove();
            MethodOptions.methodOptions.delete(this);
        }
    }

    function flyToHome() {
        if (currentPosMarker !== null) {
            map.flyTo(currentPosMarker.latlng, 16);
        }
    }

    function locationFoundCallback(e) {
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

    // ------------

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

    function requestRoute(from_latlng, to_latlng, method, fields, callback) {
        $.ajax({
            url: "/api/route",
            type: "get",
            dataType: "json",
            data: {
                "from": from_latlng.lat + "|" + from_latlng.lng,
                "to": to_latlng.lat + "|" + to_latlng.lng,
                "method": method,
                "options": btoa(JSON.stringify(fields))
            },
        }).done(callback);
    }

    // ------------

    function methodsCallback(result) {
        if (result["status"] === "ok" && result["methods"].length > 0) {

            // Add the methods
            $.each(result["methods"], function(k, method) {
                console.log(method);
                /*
                methodList.append($('<option>', {
                    value: method["name"],
                    title: method["description"],
                    text: method["display_name"]
                }));*/

                
                let fields = [];
                $.each(method["fields"], function(j, field) {
                    const field_type = field[0];
                    const field_desc = field[1];
                    switch(field_type) {
                        case "select":
                            fields.push(new OptionFieldSelect(
                                field_desc["name"], field_desc["display_name"], field_desc["description"], field_desc["values"], field_desc["default_value"]
                                ));
                            break;
                        case "checkbox":
                            fields.push(new OptionFieldCheckbox(
                                field_desc["name"], field_desc["display_name"], field_desc["description"], Boolean(field_desc["default_value"])
                                ));
                            break;
                        case "number":
                            fields.push(new OptionFieldNumber(
                                field_desc["name"], field_desc["display_name"], field_desc["description"], field_desc["default_value"], field_desc["min_value"], field_desc["max_value"]
                                ));
                            break;
                        case "range":
                            fields.push(new OptionFieldRange(
                                field_desc["name"], field_desc["display_name"], field_desc["description"], field_desc["default_value"], field_desc["min_value"], field_desc["max_value"]
                                ));
                            break;
                        default:
                            alert("Error");
                            return;
                    }
                });

                MethodOptions.addMethodOptions(method["name"], method["description"], method["display_name"], fields);
            });
        } else {
            // TODO: a massive error message
        }
    }

    let routeCounter = 1;

    function onMethodListChange(e) {
        MethodOptions.methodOptions.get(methodList.val()).show();
    }

    function onPlan(e) {
        from = searchFormFrom.latlng;
        to = searchFormTo.latlng;
        //fromName = searchFormFrom.location_name;
        //toName = searchFormTo.location_name;

        if (from === null || to === null) {
            alert("Choose a starting end ending point first");
            return;
        }

        if (MethodOptions._selectedMethodOptions == null) {
            alert("Choose a method first");
            return;
        }

        buttonPlan.prop('disabled', true);
        requestRoute(from, to, MethodOptions._selectedMethodOptions.name, MethodOptions._selectedMethodOptions.valuesToJson(), function (result){
            console.log(result);
            if (result["status"] === "ok") {
                Route.addRoute(`Route #${routeCounter++}`, result["coords"], "");
            }
            buttonPlan.prop('disabled', false);
        });
    }

    o.init = function() {
        // Initialize the map object (default location is Budapest)
        map = L.map("map", {
            center: [47.4979, 19.0402],
            zoom: 13,
            zoomControl: false
        });

        // Add zoom control
        //  We have more control if we do this instead of 'zoomControl' when initializing the map.
        L.control.zoom({
            position: "bottomright"
        }).addTo(map);

        // Add tiles
        //  Make sure that whatever tiler we use here matches with whatever data we are working with on the backend.
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);

        // Add a home button
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
        searchFormFrom = new SearchForm(
            $("#sidebar-from-form"),
            "static/img/marker-icon-green.png",
            "#105400",
            "From..."
        );
        searchFormTo = new SearchForm(
            $("#sidebar-to-form"),
            "static/img/marker-icon-red.png",
            "#670000",
            "To..."
        );

        // Request the methods
        methodList = $("#sidebar-methodselect");
        methodList.change(onMethodListChange);
        methodOptionsContainer = $("#sidebar-options-container");
        requestMethods(methodsCallback);

        buttonPlan = $("#sidebar-button-plan");
        buttonPlan.click(onPlan);

        routesTable = $("#sidebar-routes");

        console.log("initialized map!");
    }

    return o;
})();

mapWrapper.init();