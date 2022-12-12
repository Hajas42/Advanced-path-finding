class AppConfig(object):
    TESTING = False
    DEBUG = False


class AppProductionConfig(AppConfig):
    TESTING = False
    DEBUG = False


class AppTestConfig(AppConfig):
    TESTING = True
    DEBUG = True

