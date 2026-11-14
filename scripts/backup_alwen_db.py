import argparse
import os
import shutil
import sqlite3
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy.engine import make_url


def main() -> None:
    load_dotenv(Path(__file__).resolve().parents[1] / "api" / ".env")
    parser = argparse.ArgumentParser(description="Create a consistent Alwen database backup.")
    parser.add_argument("--output-dir", type=Path, default=Path("backups"))
    parser.add_argument(
        "--database-url",
        default=os.getenv("DATABASE_URL", "sqlite:///./alwen.db"),
    )
    args = parser.parse_args()

    url = make_url(args.database_url)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    if url.drivername.startswith("sqlite"):
        source = Path(url.database or "")
        if not source.is_absolute():
            source = Path.cwd() / source
        if not source.is_file():
            parser.error(f"SQLite database does not exist: {source}")
        destination = args.output_dir / f"alwen-{timestamp}.sqlite3"
        with sqlite3.connect(source) as source_connection, sqlite3.connect(destination) as backup:
            source_connection.backup(backup)
    elif url.drivername.startswith("postgresql"):
        pg_dump = shutil.which("pg_dump")
        if pg_dump is None:
            parser.error("pg_dump is required to back up PostgreSQL databases.")
        destination = args.output_dir / f"alwen-{timestamp}.dump"
        environment = os.environ.copy()
        if url.password:
            environment["PGPASSWORD"] = url.password
        command = [
            pg_dump,
            "--no-password",
            "--format=custom",
            "--file",
            str(destination),
            "--dbname",
            url.database or "",
        ]
        if url.host:
            command.extend(["--host", url.host])
        if url.port:
            command.extend(["--port", str(url.port)])
        if url.username:
            command.extend(["--username", url.username])
        try:
            subprocess.run(command, env=environment, check=True)
        except (OSError, subprocess.CalledProcessError):
            destination.unlink(missing_ok=True)
            raise
    else:
        parser.error(f"Unsupported database driver: {url.drivername}")
    print(f"Database backup created: {destination.resolve()}")


if __name__ == "__main__":
    main()
