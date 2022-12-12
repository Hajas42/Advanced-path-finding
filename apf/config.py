from ml_collections import config_dict

cfg = config_dict.ConfigDict()
cfg.default_map = 'Hungary, Budapest'
cfg.in_development = False

budapest_coordinate_boundaries = (47.35, 18.8, 47.60, 19.4)
hungary_coordinate_boundaries = (45.74, 16.11, 48.58, 22.9)

cfg.coordinates_for_incidents = budapest_coordinate_boundaries