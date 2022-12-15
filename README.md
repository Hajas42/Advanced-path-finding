# Advanced path finding

Disclaimer: this project is for a university assignment.

## Getting started:

1. To install:
    ```sh
    pip install -r requirements.txt
    python setup.py install
    ```

2. To run:
    ```sh
    apf-server
    ```
    Or:
    ```sh
    gunicorn --bind 0.0.0.0:5000 --timeout 0 "apf.app:create_app('apf.configs.AppProductionConfig')"
    ```
3. Open the link in your browser

## Development:

0. Setting up a virtual environment is probably a good idea
    ```sh
    # To create:  
    python -m venv ./venv
    # To use:
    source ./venv/bin/activate
    ```

1. To install:
    ```sh
    pip install -r requirements.txt
    python setup.py develop --user
    ```

2. To run:
    ```sh
    apf-server
    ```
3. Open the link in your browser

## Docker

```sh
docker-compose up --detach --build
```

## Testing:

To run the unit tests:
```sh
cd tests
python -m pytest test_flask.py
```
