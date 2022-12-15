from ml_collections.config_dict import ConfigDict

BUDAPEST_COORDINATE_BOUNDARIES = (47.35, 18.8, 47.60, 19.4)
HUNGARY_COORDINATE_BOUNDARIES = (45.74, 16.11, 48.58, 22.9)


def get_production_config() -> ConfigDict:
    cfg = ConfigDict()
    cfg.default_map = 'Hungary'
    cfg.in_development = False
    cfg.coordinates_for_incidents = BUDAPEST_COORDINATE_BOUNDARIES
    return cfg


def get_test_config() -> ConfigDict:
    cfg = ConfigDict()
    cfg.default_map = 'Hungary, Budapest'
    cfg.in_development = True
    cfg.coordinates_for_incidents = BUDAPEST_COORDINATE_BOUNDARIES
    return cfg


cfg = get_production_config()

