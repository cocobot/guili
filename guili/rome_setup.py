"""Utility module to import 'rome' and re-export it"""
import os
import sys
from pathlib import Path


COCOTTER_PATH = os.environ.get("COCOTTER_PATH")
if COCOTTER_PATH is not None:
    sys.path.insert(0, str(Path(COCOTTER_PATH) / "code" / "libs" / "rome"))
try:
    import rome  # noqa
except ModuleNotFoundError:
    raise ValueError("rome module not found, set COCOTTER_PATH environment variable")
