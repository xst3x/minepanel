#!/usr/bin/env python3
import os
from pathlib import Path


class Stats:
    def __init__(self, root):
        self.root = Path(root).resolve()

        self.data = {
            "Backend": {"files": 0, "lines": 0},
            "Frontend": {"files": 0, "lines": 0},
            "Tests": {"files": 0, "lines": 0},
            "Docs": {"files": 0, "lines": 0},
            "Project Index": {"files": 0, "lines": 0},
        }

        self.ignore_dirs = {
            "node_modules",
            ".git",
            ".next",
            "dist",
            "build",
            "__pycache__",
            ".venv",
            "venv",
            "public",
        }

        self.extensions = {
            ".ts", ".tsx", ".js", ".jsx",
            ".py", ".md", ".json", ".txt", ""
        }

        self.seen_files = 0

    def should_ignore(self, path: str):
        p = path.replace("\\", "/").lower()
        return any(f"/{d}/" in p for d in self.ignore_dirs)

    def classify(self, path: str):
        p = path.replace("\\", "/").lower()

        if "project-index" in p:
            return "Project Index"

        if "src/frontend/" in p:
            return "Frontend"

        if "/tests/" in p:
            return "Tests"

        if "/docs/" in p or "src/docs/" in p:
            return "Docs"

        if "src/" in p:
            return "Backend"

        return None

    def count_lines(self, file):
        try:
            with open(file, "r", encoding="utf-8", errors="ignore") as f:
                return sum(1 for _ in f)
        except:
            return 0

    def scan(self):
        print(f"[*] ROOT: {self.root}\n")

        for root, dirs, files in os.walk(self.root):
            dirs[:] = [
                d for d in dirs
                if d not in self.ignore_dirs
            ]

            for f in files:
                fp = Path(root) / f
                p = str(fp)

                self.seen_files += 1

                if self.should_ignore(p):
                    continue

                if fp.suffix not in self.extensions:
                    continue

                cat = self.classify(p)
                if not cat:
                    continue

                self.data[cat]["files"] += 1
                self.data[cat]["lines"] += self.count_lines(fp)

        print(f"[*] SEEN FILES: {self.seen_files}\n")

    def print(self):
        total_files = sum(v["files"] for v in self.data.values())
        total_lines = sum(v["lines"] for v in self.data.values())

        print("=" * 60)
        print("        MINE PANEL CLEAN STATS 💀")
        print("=" * 60)

        print(f"\nTOTAL FILES: {total_files}")
        print(f"TOTAL LINES: {total_lines}\n")

        for k, v in self.data.items():
            pct = (v["lines"] / total_lines * 100) if total_lines else 0
            print(f"{k:<15} {v['files']:>6} files | {v['lines']:>8} lines | {pct:>5.1f}%")

        print("\n" + "=" * 60 + "\n")


def main():
    path = r"C:\Users\stefa\Desktop\MinePanel"

    stats = Stats(path)
    stats.scan()
    stats.print()


if __name__ == "__main__":
    main()