from pathlib import Path

ROOT = Path(".")

SKIP_DIRS = {
    "node_modules",
    ".git",
    ".github",
    "venv",
    ".venv",
    "__pycache__",
    "dist",
    "build",
    ".next",
    ".vite",
    ".turbo",
    ".cache",
    "coverage",
    "out",
    "public",
    "assets",
    "servers",
}

for file in ROOT.rglob("*"):
    if not file.is_file():
        continue

    # Ignorează orice fișier din directoarele de mai sus
    if any(part in SKIP_DIRS for part in file.parts):
        continue

    if file.suffix == ".js":
        new_file = file.with_suffix(".ts")
    elif file.suffix == ".jsx":
        new_file = file.with_suffix(".tsx")
    else:
        continue

    # Nu face nimic dacă există deja fișierul nou
    if new_file.exists():
        print(f"Skipped (already exists): {new_file}")
        continue

    file.rename(new_file)
    print(f"Renamed: {file} -> {new_file}")

print("Done!")