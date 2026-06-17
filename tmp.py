import os

EXTENSIONS = {".js", ".html", ".jsx", ".css", ".json"}
TARGETS = ["â€¦", "â€"]

def scan_file(file_path):
    matches = []

    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            for i, line in enumerate(f, start=1):
                for t in TARGETS:
                    if t in line:
                        matches.append((t, i))
    except:
        return []

    return matches


def scan_folder(root_dir):
    for root, _, files in os.walk(root_dir):
        for file in files:
            if any(file.endswith(ext) for ext in EXTENSIONS):
                full_path = os.path.join(root, file)

                hits = scan_file(full_path)
                for t, line_no in hits:
                    print(f'"{t}" found in {full_path} at line {line_no}')


if __name__ == "__main__":
    scan_folder(".")