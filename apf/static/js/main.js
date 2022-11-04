function initMap() {
    console.log("Callback received!");

    var mapProp = {
        center: new google.maps.LatLng(47.4813602, 18.990221),
        zoom: 10,
    };

    // var map = new google.maps.Map($("#map"), mapProp);
    var map = new google.maps.Map(document.getElementById("map"), mapProp);
}

$(document).ready(function () {
    console.log("ready!");

    $.ajax({
        url: "/api/test/somebody",
        type: "get",
        data: {
            "location": "Budapest"
        },
    }).done(function (data) {
        console.log("Api returned:", data);
    });

    $.ajax({
        url: "/api/test/somebody_else",
    }).done(function (data) {
        console.log("Api returned:", data);
    });
});