import pytest
from apf.app import create_app
import apf.configs


class AppTestConfig(apf.configs.AppConfig):
    pass


@pytest.fixture()
def app():
    app = create_app(AppTestConfig)
    app.config.update({
        "TESTING": True,
    })

    # other setup can go here

    yield app

    # clean up / reset resources here


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def runner(app):
    return app.test_cli_runner()


# def test_api_geocoding(client):
#     response = client.get("/api/geocoding")
#     assert response.status_code == 200
#
#
# def test_api_reverse(client):
#     response = client.get("/api/reverse")
#     assert response.status_code == 200
#
#
# def test_api_autocomplete(client):
#     response = client.get("/api/autocomplete")
#     assert response.status_code == 200


def test_api_config(client):
    response = client.get("/api/config")
    assert response.json["status"] == "ok"
    for k in ("bounds", "planners"):
        assert k in response.json
    assert response.status_code == 200


# def test_api_plan(client):
#     response = client.get("/api/plan")
#     assert response.status_code == 200



