from . import configs
from .app import create_app
import sys


def main():
    # Config possibilities:
    # create_app(configs.AppTestConfig()).run()
    # create_app("apf.configs.AppProductionConfig").run()

    # TODO: use argparse

    modes = {
        "dev": "apf.configs.AppTestConfig",
        "production": "apf.configs.AppProductionConfig"
    }

    mode = "dev"
    if len(sys.argv) >= 2:
        mode = sys.argv[1]

    if mode not in modes:
        print(f"Usage: {sys.argv[0]} [{','.join(modes.keys())}]")
        exit(1)

    print(f"Starting in '{mode}' mode!")
    create_app(modes[mode]).run()


if __name__ == "__main__":
    main()

