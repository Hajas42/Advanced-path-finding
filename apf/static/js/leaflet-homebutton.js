L.Control.HomeButton = L.Control.extend({
    options: {
        position: "bottomright",
        homeText: "<i class=\"fas fa-location\"></i>",
        homeTitle: "Home",
        onClick: function (){ }
    },

    onAdd: function (map) {
        let container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        let button = L.DomUtil.create('a', 'leaflet-control-button', container);
        options = this.options;

        L.DomEvent.on(button, 'mousedown dblclick', L.DomEvent.stopPropagation);
        L.DomEvent.on(button, 'click', options.onClick);

        button.innerHTML = options.homeText;
        button.href = "#";
        button.title = options.homeTitle;
        return container;
    },

    onRemove: function(map) {},
});