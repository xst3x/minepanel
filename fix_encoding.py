import os

EXTENSIONS = {".js", ".html", ".jsx", ".css", ".json"}

# Toate secventele de bytes glitched de sters
TARGETS = [
    # Double-encoded mojibake (â€" â€¢ â€¦ etc.) - trebuie stearse INAINTE de single
    b'\xc3\xa2\xe2\x82\xac\xe2\x80\x9d',  # â€" (double-encoded em dash)
    b'\xc3\xa2\xe2\x82\xac\xc2\xa2',       # â€¢ (double-encoded bullet)
    b'\xc3\xa2\xe2\x82\xac\xe2\x80\xa6',   # â€¦ (double-encoded ellipsis)
    # Single UTF-8 chars
    b'\xe2\x80\x9d',  # " curly right quote
    b'\xe2\x80\x9c',  # " curly left quote
    b'\xe2\x80\xa2',  # • bullet
    b'\xe2\x80\x94',  # — em dash
    b'\xe2\x80\x93',  # – en dash
    b'\xe2\x80\xa6',  # … ellipsis
]

FILES_TO_FIX = [
    r".\node_modules\minepanel-frontend\src\pages\Discord.jsx",
    r".\node_modules\minepanel-frontend\src\pages\Settings.jsx",
    r".\node_modules\minepanel-frontend\src\pages\Users.jsx",
    r".\node_modules\minepanel-frontend\src\pages\server\Ftp.jsx",
    r".\node_modules\minepanel-frontend\src\pages\server\Settings.jsx",
    r".\src\frontend\src\pages\Discord.jsx",
    r".\src\frontend\src\pages\Settings.jsx",
    r".\src\frontend\src\pages\Users.jsx",
    r".\src\frontend\src\pages\server\Ftp.jsx",
    r".\src\frontend\src\pages\server\Settings.jsx",
    r".\src\core\processManager.js",
    r".\src\routes\serverRoutes.js",
    r".\src\public\assets\index-DNH-Gm99.js",
]

def fix_file(path):
    try:
        with open(path, "rb") as f:
            content = f.read()

        original = content
        for target in TARGETS:
            content = content.replace(target, b'')

        if content != original:
            with open(path, "wb") as f:
                f.write(content)
            print(f"[FIXED] {path}")
        else:
            print(f"[SKIP]  {path} (nothing to fix)")

    except Exception as e:
        print(f"[ERROR] {path}: {e}")

if __name__ == "__main__":
    os.chdir(r"C:\Users\stefa\Desktop\MinePanel")
    for fp in FILES_TO_FIX:
        fix_file(fp)
    print("\nDone!")
