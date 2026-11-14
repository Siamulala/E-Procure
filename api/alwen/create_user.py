import argparse
from getpass import getpass

from sqlalchemy import func, select

from alwen.auth import hash_password
from alwen.database import SessionLocal
from alwen.models import Project, User, UserRole


def main() -> None:
    parser = argparse.ArgumentParser(description="Create an Alwen API user.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--role", choices=[role.value for role in UserRole], required=True)
    parser.add_argument("--project-id", type=int)
    args = parser.parse_args()

    email = args.email.strip().lower()
    if email.count("@") != 1 or "." not in email.rsplit("@", 1)[1]:
        parser.error("Enter a valid email address.")
    if not args.name.strip():
        parser.error("Name cannot be empty.")
    if args.role == UserRole.PROJECT_MANAGER.value and args.project_id is None:
        parser.error("Project Managers must be assigned a project with --project-id.")
    password = getpass("Password (minimum 12 characters): ")
    confirmation = getpass("Confirm password: ")
    if len(password) < 12:
        parser.error("Password must contain at least 12 characters.")
    if password != confirmation:
        parser.error("Passwords do not match.")

    with SessionLocal() as db:
        if db.scalar(select(User.id).where(func.lower(User.email) == email)) is not None:
            parser.error(f"A user with email {email} already exists.")
        if args.project_id is not None and db.get(Project, args.project_id) is None:
            parser.error(f"Project {args.project_id} does not exist.")
        user = User(
            email=email,
            full_name=args.name.strip(),
            password_hash=hash_password(password),
            role=args.role,
            project_id=args.project_id,
        )
        db.add(user)
        db.commit()
        print(f"Created {user.role} user {user.email} (id={user.id}).")


if __name__ == "__main__":
    main()
