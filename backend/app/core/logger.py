import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

LOG_DIR = Path("logs")
LOG_DIR.mkdir(parents=True, exist_ok=True)

_FORMATTER = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")


def _make_handler(filename: str, level: int = logging.INFO) -> RotatingFileHandler:
    handler = RotatingFileHandler(
        LOG_DIR / filename, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"
    )
    handler.setLevel(level)
    handler.setFormatter(_FORMATTER)
    return handler


def get_logger(name: str, *, worker: bool = False) -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        logger.setLevel(logging.INFO)
        logger.propagate = False
        logger.addHandler(_make_handler("worker.log" if worker else "app.log"))
        logger.addHandler(_make_handler("error.log", level=logging.ERROR))
    return logger
