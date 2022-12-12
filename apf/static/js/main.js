var mapWrapper = (function() {
    var o = {};

    // https://stackoverflow.com/questions/3514784/how-to-detect-a-mobile-device-using-jquery
    // TODO: somehow sync this with css
    let isMobile = window.matchMedia("only screen and (max-width: 768px)").matches;

    // -------------------------------------------
    // - GLOBAL OBJECTS
    // -------------------------------------------
    let map;  // the global map object
    let mapBounds = null;
    let currentPosMarker = null;
    let searchFormFrom = null;
    let searchFormTo = null;
    let buttonPlan = $("#sidebar-button-plan");
    let bodyElement = $('body');

    // -------------------------------------------
    // - POPUPS
    // -------------------------------------------
    class Popup {
        static popups = new Set();

        /**
         * Adds a popup
         * @param {String}  title   the title of the popup
         * @param {String}  content the content of the popup
         * @param {Boolean} modal   whether it is modal
         * @returns 
         */
        static addPopup(title, content, modal) {
            return new Popup(title, content, modal);
        }

        /**
         * Constructs a popup
         * @param {String}  title   the title of the popup
         * @param {String}  content the content of the popup
         * @param {Boolean} modal   whether it is modal
         * @returns 
         */
        constructor(title, content, modal) {
            Popup.popups.add(this);

            if (modal) {
                this._modalElement = $('<div class="modal-block"></div>');
                bodyElement.append(this._modalElement);
            } else {
                this._modalElement = null;
            }

            this._popupTitleElement = $('<div class="popup-header"></div>');
            this._popupTitleElement.text(title);
            this._popupContentElement = $('<div class="popup-content"></div>');
            this._popupContentElement.text(content);
            this._buttonOkElement = $('<button type="button">OK</button>');
            this._buttonCloseElement = $('<button type="button">Close</button>');
            this._popupButtonsElement = $('<div class="popup-buttons"></div>').append(this._buttonOkElement, this._buttonCloseElement);
            this._popupElement = $('<div class="popup">').append(this._popupTitleElement, this._popupContentElement, this._popupButtonsElement);

            this._popup_ctx = {popup: this};
            this._buttonOkElement.click(() => this.remove());
            this._buttonCloseElement.click(() => this.remove());

            bodyElement.append(this._popupElement);
        }

        /**
         * Destroys the popup
         */
        remove() {
            if (this._modalElement != null)
                this._modalElement.remove();
            this._popupElement.remove();
            Popup.popups.delete(this);
        }
    }

    // -------------------------------------------
    
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
            this.autocompleteDom = this.formDom.find(".sidebar-search-autocomplete");
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
            this._autocompleteTimer = null;

            // Set up the events
            this.formDom.bind("submit", this._form_ctx, this._onSubmit);
            this.inputDom.bind("input", this._form_ctx, this._onInputChange);
            this.inputDom.bind("focusout", this._form_ctx, this._onInputFocusOut);
            this.locationDom.bind("click", this._form_ctx, this._onLocationClick);
        }

        /**
         * Constructs a search form HTML.
         * @returns a search form
         */
        static constructFormElement() {
            // TODO: is there a nicer way of doing this?
            return $('<form autocomplete="off" id="sidebar-from-form" class="sidebar-element sidebar-search sidebar-roundinside">')
                    .append('<input class="sidebar-search-input" type="text" name="search" />')
                    .append('<div class="sidebar-search-autocomplete"></div>')
                    .append('<button class="sidebar-button sidebar-search-location" type="button"><i class="fa fa-location-dot"></i></button>')
                    .append('<button class="sidebar-button sidebar-search-submit" type="submit"><i class="fa fa-search"></i></button>');
        }

        /**
         * The current coordinate of the placed marker. If there is not a marker placed, the result will be null.
         */
        get latlng() {
            return this._latlng;
        }

        /**
         * The current name of the current location.
         */
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
         * Cancels the autocomplete process.
         */
        _cancelAutocomplete() {
            // Cancel any pending autocomplete
            if (this._autocompleteRequest != null) {
                this._autocompleteRequest.abort();
                this._autocompleteRequest = null;
            }
            if (this._autocompleteTimer != null) {
                clearTimeout(this._autocompleteTimer);
                this._autocompleteTimer = null;
            }

            // Reuse the timer object for this dirty hack
            this._autocompleteTimer = setTimeout(() => {
                this.autocompleteDom.empty();
                this.autocompleteDom.hide();
            }, 200);
        }

        /**
         * A callback for when the address search bar's content is modified.
         * @param {*} e event parameter
         */
        _onInputChange(e) {
            let form = e.data.form;

            // The user cleared the input
            if (form.inputDom.val() === "") {
                form._cancelAutocomplete();
                return;
            }

            // Timeout to ease the load on the backend
            if (form._autocompleteTimer != null)
                clearTimeout(form._autocompleteTimer);
            form._autocompleteTimer = setTimeout(function() {
                // Terminate any previous requests
                if (form._autocompleteRequest != null)
                    form._autocompleteRequest.abort();
                form._autocompleteRequest = requestAutocomplete(form.inputDom.val(), function(result) {

                    // Clear previous results
                    form.autocompleteDom.empty();
                    form.autocompleteDom.show();

                    if (result["status"] !== "ok" || result["locations"].length == 0)
                        return;

                    // Add results
                    result["locations"].forEach(entry => {
                        const name = entry.name;
                        const latlng = L.latLng(entry.lat, entry.lon);
                        let itemElement = $('<div></div>').text(name);
                        itemElement.click(function() {
                            form.inputDom.val(name);
                            form.markerPlaceAt(latlng, name);
                            map.flyTo(latlng, 16);
                        });
                        form.autocompleteDom.append(itemElement);
                    });
                });
            }, 500);
        }

        _onInputFocusOut(e) {
            let form = e.data.form;

            form._cancelAutocomplete();
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
        // https://stackoverflow.com/questions/10014271/generate-random-color-distinguishable-to-humans
        static _colorCounter = 0;
        static nextColor() {
            const hue = Route._colorCounter++ * 137.508; // use golden angle approximation
            return `hsl(${hue},100%,30%)`;
        }

        static routesTable;
        static {
            this.routesTable = $("#sidebar-routes");
        }

        static routes = new Set();

        /**
         * Adds a route object
         * @param {String} name                  the displayed name of the route
         * @param {L.latLng[]} waypoints         the route waypoints
         * @param {String} [description=""]      the description of the route
         * @param {String} [lineColor=undefined] the line color of the route in a css friendly format
         */
        static addRoute(name, waypoints, description, lineColor) {
            return new Route(name, waypoints, description, lineColor)
        }

        /**
         * Constructs a route object
         * @param {String} name                  the displayed name of the route
         * @param {L.latLng[]} waypoints         the route waypoints
         * @param {String} [description=""]      the description of the route
         * @param {String} [lineColor=undefined] the line color of the route in a css friendly format
         */
        constructor(name, waypoints, description, lineColor) {
            Route.routes.add(this);

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
            this._routeLine.on('mouseover', () => this._highlightEnable());
            this._routeLine.on('mouseout', () => this._highlightDisable());

            // Sidebar entry
            this._entryName = $('<input type="text" value="" />');
            this._entryNameContainer = $('<div class="sidebar-table-cell sidebar-route-name"></div>').append(this._entryName);
            this._entryLine = $('<div></div>')
            this._entryLineContainer = $('<div class="sidebar-table-cell sidebar-route-line"></div>').append(this._entryLine);
            this._entryRemove = $('<button type="button"><i class="fa fa-times" aria-hidden="true"></i></button>');
            this._entryRemoveContainer = $('<div class="sidebar-table-cell sidebar-route-remove"></button></div>').append(this._entryRemove);
            this._entryRow = $('<div class="sidebar-table-row sidebar-routes-row">').append(this._entryNameContainer).append(this._entryLineContainer).append(this._entryRemoveContainer);

            this._entryName.bind("focusout", () => {
                this._name = this._entryName.val();
                this._updatePopup();
            });
            this._entryRow.bind("mouseenter", () => this._highlightEnable());
            this._entryRow.bind("mouseleave", () => this._highlightDisable());
            this._entryLineContainer.bind("click", () => {
                map.fitBounds(this._routeLine.getBounds());
                this._routeLine.openPopup();
            });
            this._entryRemove.bind("click", () => this.remove());

            this._entryName.val(name);
            this._entryLine.css('background', lineColor);
            Route.routesTable.append(this._entryRow);
        }

        _updatePopup() {
            let title = $('<h3></h3>');
            title.text(this._name);
            let description = $('<p></p>');
            description.text(this._description);

            this._routeLine._popup.setContent($('<div></div>').append(title).append(description).get(0));
        }

        _highlightEnable() {
            this._routeLine.setStyle(this._routeHighlightedStyle);
        }

        _highlightDisable() {
            this._routeLine.setStyle(this._routeStyle);
        }

        remove() {
            this._entryRow.remove();
            map.removeLayer(this._routeLine);
            Route.routes.delete(this);
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

        get value() {
            throw new Error("Not implemented");
        }

        set value(val) {
            throw new Error("Not implemented");
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
            this._maxValue = minValue;
            this._maxValue = maxValue;
            this._fieldNumber = $('<input type="number">');
            if (minValue != null)
                this._fieldNumber.prop("min", minValue);
            if (maxValue != null)
                this._fieldNumber.prop("max", maxValue);
            this._ctx = { field: this };
            this._fieldNumber.bind('input', () => this._fieldNumber.val(this._clampValue(this._fieldNumber.val())));
            this._fieldNumber.val(defaultValue);
            this.rowFieldCell.append(this._fieldNumber);
        }

        _clampValue(val) {
            if (this._maxValue != null)
                val = Math.min(val, this._maxValue);
            if (this._minValue != null)
                val = Math.max(this._minValue, val);
            return val;
        }

        get value() {
            return parseInt(this._fieldNumber.val());
        }

        set value(val) {
            return this._fieldNumber.val(this._clampValue(val));
        }
    }

    class OptionFieldRange extends OptionField {
        constructor(name, displayName, description, defaultValue, minValue, maxValue) {
            super(name, displayName, description);
            this._maxValue = minValue;
            this._maxValue = maxValue;
            this._fieldRange = $('<input type="range">');
            if (minValue != null)
                this._fieldRange.prop("min", minValue);
            if (maxValue != null)
                this._fieldRange.prop("max", maxValue);
            this._ctx = { field: this };
            this._fieldRange.bind('input', () => this._fieldRange.val(this._clampValue(this._fieldRange.val())));
            this._fieldRange.val(defaultValue);
            this.rowFieldCell.append(this._fieldRange);
        }

        _clampValue(val) {
            if (this._maxValue != null)
                val = Math.min(val, this._maxValue);
            if (this._minValue != null)
                val = Math.max(this._minValue, val);
            return val;
        }


        get value() {
            return parseInt(this._fieldRange.val());
        }

        set value(val) {
            return this._fieldRange.val(val);
        }
    }

    class PlannerOptions {
        static _selectedPlannerOptions = null;

        static plannerOptions = new Map();

        // --- Handle 
        static plannerList;
        static plannerOptionsContainer;

        static _hideWithReason(reason) {
            if (PlannerOptions._selectedPlannerOptions != null)
                PlannerOptions._selectedPlannerOptions.hide();
            console.log(PlannerOptions.plannerOptionsContainer.attr("data-placeholder"));
            PlannerOptions.plannerOptionsContainer.attr("data-placeholder", reason);
            console.log(PlannerOptions.plannerOptionsContainer.attr("data-placeholder"));
            PlannerOptions.plannerOptionsContainer.addClass("sidebar-placeholder-force");
        }

        static {
            this.plannerList = $("#sidebar-methodselect");
            this.plannerOptionsContainer = $("#sidebar-options-container");
            this.plannerList.change(() => {
                let selectValue = PlannerOptions.plannerList.val();

                // Empty selection, should not be possible, but hey
                if (selectValue === "") {
                    PlannerOptions._hideWithReason("Select a method first");
                    return;
                }

                let planner = PlannerOptions.plannerOptions.get(selectValue);
                if (planner.is_empty()) {
                    PlannerOptions._hideWithReason("This planner does not have any options");
                } else {
                    PlannerOptions.plannerOptionsContainer.removeClass("sidebar-placeholder-force");
                    planner.show();
                }
            });
        }

        static addPlannerOptions(name, displayName, description, fields) {
            return new PlannerOptions(name, displayName, description, fields)
        }

        constructor(name, displayName, description, fields) {
            this.name = name;
            this.displayName = displayName;
            this.description = description;

            PlannerOptions.plannerOptions.set(this.name, this);
            
            this._plannerListElement = $('<option>', {
                value: this.name,
                text: this.displayName,
                title: this.description
            });
            PlannerOptions.plannerList.append(this._plannerListElement);

            this._optionsElement = $('<div class="sidebar-table sidebar-options"></div>');
            this._optionsElement.hide();
            this.fields = fields;
            this.fields.forEach(field => {
                this._optionsElement.append(field.row);
            });
            PlannerOptions.plannerOptionsContainer.append(this._optionsElement);
        }

        valuesToJson() {
            let json = {}
            this.fields.forEach(field => {
                json[field.name] = field.value;
            });
            return json;
        }

        hide() {
            if (PlannerOptions._selectedPlannerOptions === this)
                PlannerOptions._selectedPlannerOptions = null;
            this._optionsElement.hide();
        }

        show () {
            if (PlannerOptions._selectedPlannerOptions !== null)
                PlannerOptions._selectedPlannerOptions.hide();
            PlannerOptions._selectedPlannerOptions = this;
            this._optionsElement.show();
        }

        is_empty() {
            return this.fields.length == 0;
        }

        remove() {
            this._plannerListElement.remove();
            this._optionsElement.remove();
            PlannerOptions.plannerOptions.delete(this);
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

    // -------------------------------------------------------------
    // - API CALLS
    // -------------------------------------------------------------

    /**
     * Helper function to convert from leaflet js's "latlng" to our "latlon".
     */
    function latlng2latlon(latlng) {
        return {lat: latlng.lat, lon: latlng.lng};
    }

    /**
     * Standard ajax error handler
     */
    function onJQueryCommunicationError(jqXHR, textStatus, errorThrown) {
        if (errorThrown === "abort")
            return;

        console.log("Communication error:", jqXHR, textStatus, errorThrown);
        Popup.addPopup("Error", "Error while communicating with the backend.", true);
    }

    function requestGeocoding(query, onSuccessCallback, onFailCallback, alwaysCallback) {
        return $.ajax({
            url: "/api/geocoding",
            type: "get",
            dataType: "json",
            data: {
                "location": query
            },
        }).done(onSuccessCallback).fail(onFailCallback || onJQueryCommunicationError).always(alwaysCallback);
    }

    function requestReverse(latlng, onSuccessCallback, onFailCallback, alwaysCallback) {
        return $.ajax({
            url: "/api/reverse",
            type: "get",
            dataType: "json",
            data: latlng2latlon(latlng),
        }).done(onSuccessCallback).fail(onFailCallback || onJQueryCommunicationError).always(alwaysCallback);
    }

    function requestAutocomplete(query, onSuccessCallback, onFailCallback, alwaysCallback) {
        return $.ajax({
            url: "/api/autocomplete",
            type: "get",
            dataType: "json",
            data: {
                "query": query,
            },
        }).done(onSuccessCallback).fail(onFailCallback || onJQueryCommunicationError).always(alwaysCallback);
    }

    function requestConfig(onSuccessCallback, onFailCallback, alwaysCallback) {
        return $.ajax({
            url: "/api/config",
            type: "get",
            dataType: "json",
        }).done(onSuccessCallback).fail(onFailCallback || onJQueryCommunicationError).always(alwaysCallback);
    }

    function requestPlan(from_latlng, to_latlng, planner, fields, onSuccessCallback, onFailCallback, alwaysCallback) {
        return $.ajax({
            url: "/api/plan",
            type: "post",
            dataType: "json",
            data: JSON.stringify({
                "from": latlng2latlon(from_latlng),
                "to": latlng2latlon(to_latlng),
                "planner": planner,
                "fields": fields
            }),
            contentType: "application/json; charset=utf-8",
        }).done(onSuccessCallback).fail(onFailCallback || onJQueryCommunicationError).always(alwaysCallback);
    }

    // -------------------------------------------------------------
    // - End of API CALLS
    // -------------------------------------------------------------

    function configCallback(result) {
        if (result["status"] === "ok" && result["planners"].length > 0) {
            // Add the map bounds
            let worldLatlngs = [
                L.latLng([90, 180]),
                L.latLng([90, -180]),
                L.latLng([-90, -180]),
                L.latLng([-90, 180])
            ];
            mapBounds = L.polygon([worldLatlngs, result["bounds"]], {color: 'red'}).addTo(map);
            mapBounds.bindPopup("Not yet supported");

            // Add the methods
            $.each(result["planners"], function(k, planner) {
                let fields = [];
                $.each(planner["fields"], function(j, field) {
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
                            Popup.addPopup("Error", "Error while retrieving the planners.", true);
                            return;
                    }
                });

                PlannerOptions.addPlannerOptions(planner["name"], planner["display_name"], planner["description"], fields);
            });
        } else {
            Popup.addPopup("Error", "Error while retrieving the planners.", true);
        }
    }

    let routeCounter = 1;

    function onPlan(e) {
        from = searchFormFrom.latlng;
        to = searchFormTo.latlng;
        fromName = searchFormFrom.location_name;
        toName = searchFormTo.location_name;

        if (from === null || to === null) {
            Popup.addPopup("Info", "Please choose a starting end ending point first.", true);
            return;
        }

        let _plannerOptions = PlannerOptions._selectedPlannerOptions;
        if (_plannerOptions == null) {
            Popup.addPopup("Info", "Please choose a planner first.", true);
            return;
        }

        // Block the button temporarely
        buttonPlan.prop('disabled', true);
        requestPlan(from, to, _plannerOptions.name, _plannerOptions.valuesToJson(),
            function (result){
                if (result["status"] === "ok") {
                    let description = `A route from '${fromName}' to '${toName}' using the planner named '${_plannerOptions.displayName}'.`
                    Route.addRoute(`${_plannerOptions.displayName} #${routeCounter++}`, result["coords"], description);
                } else {
                    Popup.addPopup("Error", "Error while planning the route.", true);
                }
            },
            null,
            function() {
                // Make sure to unblock the button even upon failiure
                buttonPlan.prop('disabled', false);
            }
        );
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

        // -----------------------------------------------------
        // - TODO: move these elsewhere
        // -----------------------------------------------------

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
        buttonPlan.click(onPlan);

        // Request the methods
        requestConfig(configCallback);

        console.log("initialized map!");
    }

    return o;
})();

mapWrapper.init();