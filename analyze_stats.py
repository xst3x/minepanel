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
            "Styles": {"files": 0, "lines": 0},
        }

        self.ignore_dirs = {
            "node_modules", ".git", ".next", "dist",
            "build", "__pycache__", ".venv", "venv",
            "public", "cache", ".agent"
        }

        self.ignore_suffix = {
            ".json", ".lock", ".md", ".log", ".txt"
        }

        self.extensions = {
            ".ts", ".tsx", ".js", ".jsx",
            ".py",
            ".css", ".scss", ".less"
        }

        self.seen_files = 0
        self.file_stats = []  # full project
        self.src_file_stats = []  # ONLY /src for refactor map

    def should_ignore(self, path: str):
        p = path.replace("\\", "/").lower()
        return any(f"/{d}/" in p for d in self.ignore_dirs)

    def count_lines(self, file):
        try:
            with open(file, "r", encoding="utf-8", errors="ignore") as f:
                return sum(1 for _ in f)
        except:
            return 0

    def classify(self, path: str):
        p = path.replace("\\", "/").lower()

        if p.endswith((".css", ".scss", ".less")):
            return "Styles"

        if "project-index" in p:
            return "Project Index"
        if "src/frontend/" in p:
            return "Frontend"
        if "/tests/" in p:
            return "Tests"
        if "/docs/" in p:
            return "Docs"
        if "src/" in p:
            return "Backend"

        return "Other"

    def scan(self):
        print(f"[*] ROOT: {self.root}\n")

        for root, dirs, files in os.walk(self.root):
            dirs[:] = [d for d in dirs if d not in self.ignore_dirs]

            for f in files:
                fp = Path(root) / f
                self.seen_files += 1

                p = str(fp).replace("\\", "/").lower()

                if self.should_ignore(p):
                    continue

                if fp.suffix in self.ignore_suffix:
                    continue

                if fp.suffix not in self.extensions:
                    continue

                cat = self.classify(p)

                try:
                    size = fp.stat().st_size
                except:
                    size = 0

                lines = self.count_lines(fp)

                if cat in self.data:
                    self.data[cat]["files"] += 1
                    self.data[cat]["lines"] += lines

                self.file_stats.append((str(fp), lines, size, cat))

                # ONLY src for refactor map
                if "/src/" in p:
                    self.src_file_stats.append((str(fp), lines, size, cat))

        print(f"[*] SEEN FILES: {self.seen_files}\n")

    def severity(self, lines):
        if lines >= 2000:
            return "🔥 CRITICAL"
        if lines >= 1000:
            return "⚠️ SPLIT REQUIRED"
        if lines >= 600:
            return "🟡 REVIEW"
        return "🟢 OK"

    def print_stats(self):
        total_files = sum(v["files"] for v in self.data.values())
        total_lines = sum(v["lines"] for v in self.data.values())

        print("=" * 60)
        print("        MINE PANEL REFACTOR MAP 💀")
        print("=" * 60)

        print(f"\nTOTAL FILES: {total_files}")
        print(f"TOTAL LINES: {total_lines}\n")

        for k, v in self.data.items():
            pct = (v["lines"] / total_lines * 100) if total_lines else 0
            print(f"{k:<15} {v['files']:>6} files | {v['lines']:>8} lines | {pct:>5.1f}%")

        print("\n" + "=" * 60 + "\n")

    def print_refactor_map(self, top_n=10):
        sorted_files = sorted(
            self.src_file_stats,   # ONLY src now
            key=lambda x: x[1],
            reverse=True
        )

        print("\n" + "=" * 60)
        print(f"        TOP {top_n} REFACTOR FILES (/src ONLY) 💀")
        print("=" * 60)

        for path, lines, size, cat in sorted_files[:top_n]:
            sev = self.severity(lines)

            print(f"{lines:>5} lines | {size/1024:.1f} KB | {sev}")
            print(f"      {path}")
            print(f"      type: {cat}\n")

        print("=" * 60 + "\n")


def main():
    path = r"C:\Users\stefa\Desktop\MinePanel"

    stats = Stats(path)
    stats.scan()
    stats.print_stats()
    stats.print_refactor_map(10)


if __name__ == "__main__":
    main()