import os.path
import time
from typing import Dict, Optional, List, Callable, Tuple, Any
import osmnx as ox
import pickle
import tempfile
import atexit

# Make sure we have a default cache dir
DEFAULT_CACHE_DIR = f'{tempfile.gettempdir()}/apf_cache/'
os.makedirs(DEFAULT_CACHE_DIR, exist_ok=True)

# TODO: we might want to invalidate the cache ever so often
ox.config(use_cache=True, cache_folder=f'{DEFAULT_CACHE_DIR}/osmnx_cache/')


# A hack to support saving on __del__:
#  __del__ might be called after everything has been torn down, hence you can't really do much there.
#  This little trick lets us check if that's the case, so we can avoid calling potentially crashing stuff.
_shutting_down_flag = [False]


def _set_shutting_down():
    _shutting_down_flag[0] = True


def _is_shutting_down(_shutting_down_flag=_shutting_down_flag):
    return _shutting_down_flag[0]


atexit.register(_set_shutting_down)


def _make_hash_dict(kwds):
    return tuple(
        tuple(_make_hash_dict(x) if isinstance(x, dict) else x for x in item)
        for item in kwds.items()
    )


def _make_hash_args(args):
    return tuple(
        tuple(_make_hash_dict(x) if isinstance(x, dict) else x for x in item)
        for item in args
    )


class OSMNXProvider:
    """A memoizing wrapper mostly for osmnx"""

    # TODO: versioning

    def __init__(
            self,
            cache_path: str = f'{DEFAULT_CACHE_DIR}/osmnx_provider.cache',
            cache_duration_seconds: int = 60 * 60 * 24
    ):
        self._cache_path: str = cache_path
        self._cache_duration_seconds: int = cache_duration_seconds
        self._cache: Dict[Tuple, Any] = dict()

        # Try loading the previous values
        self.load()

        # Make sure to save at the end
        atexit.register(self.save)

    def __del__(self, _is_shutting_down=_is_shutting_down):
        if not _is_shutting_down():
            self.save()

    @property
    def cache_path(self) -> str:
        return self._cache_path

    @property
    def cache_duration_seconds(self) -> int:
        return self._cache_duration_seconds

    def remove_older(self, than_seconds: int):
        """Removes entries that are older than 'than_seconds' from the cache"""
        # TODO
        raise NotImplementedError

    def wrap(self, func: Callable, *args, **kwargs):
        """Caches a function call based on its arguments"""

        ct = int(time.time())
        key = _make_hash_args(args) + _make_hash_dict(kwargs)
        if key in self._cache:
            tt, val = self._cache[key]
            if tt + self._cache_duration_seconds > ct:
                return val

        val = func(*args, **kwargs)
        self._cache[key] = ct, val
        return val

    def save(self):
        """Saves the cached dictionary to disk using pickle"""

        with open(self._cache_path, "wb") as f:
            pickle.dump(self._cache, f)

    def load(self) -> bool:
        """Loads the cached dictionary from disk using pickle"""

        if self.exists_cache():
            try:
                with open(self._cache_path, "rb") as f:
                    self._cache = pickle.load(f)
            except Exception:
                # Maybe the file is corrupted, remove it
                os.unlink(self._cache_path)
            return True
        else:
            return False

    def exists_cache(self) -> bool:
        """Checks whether there is a cache file on the disk"""
        return os.path.isfile(self._cache_path)

