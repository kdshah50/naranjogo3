from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

from config import get_settings

_settings = get_settings()

# SQLite needs check_same_thread=False for FastAPI sync sessions
_connect_args = {}
if _settings.DATABASE_URL.startswith("sqlite"):
    _connect_args = {"check_same_thread": False}

engine = create_engine(
    _settings.DATABASE_URL,
    connect_args=_connect_args,
    echo=False,
)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
