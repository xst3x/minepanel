#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MinePanel Installer
Cross-platform setup script — Windows & Linux
https://github.com/xst3x/minepanel
"""

# ── BOOT GUARD — must be the very first executable lines ──────────────────────
import sys
import os

sys.stdout.reconfigure(line_buffering=True) if hasattr(sys.stdout, 'reconfigure') else None

print("=" * 56, flush=True)
print("  MinePanel Installer — BOOT START", flush=True)
print("=" * 56, flush=True)

# ── Safe imports ──────────────────────────────────────────────────────────────
print("[BOOT] Importing standard library...", flush=True)
try:
    import ssl
    import json
    import shutil
    import string
    import secrets
    import platform
    import subprocess
    import tempfile
    import time
    import urllib.request
    import urllib.error
    from pathlib import Path
    print("[BOOT] Imports OK", flush=True)
except Exception as _import_err:
    print(f"[BOOT] FATAL: Import failed — {repr(_import_err)}", flush=True)
    input("Press Enter to exit...")
    sys.exit(1)

# ── Constants ─────────────────────────────────────────────────────────────────
print("[BOOT] Detecting OS...", flush=True)
try:
    REPO_URL       = "https://github.com/xst3x/minepanel.git"
    APP_NAME       = "minepanel"
    MIN_NODE_MAJOR = 18
    HEALTH_TIMEOUT = 90

    OS       = platform.system()
    IS_WIN   = OS == "Windows"
    IS_LINUX = OS == "Linux"

    if IS_WIN:
        IS_ROOT = False
    else:
        IS_ROOT = (os.geteuid() == 0)

    print(f"[BOOT] OS={OS}  IS_WIN={IS_WIN}  IS_LINUX={IS_LINUX}  IS_ROOT={IS_ROOT}", flush=True)
except Exception as _os_err:
    print(f"[BOOT] FATAL: OS detection failed — {repr(_os_err)}", flush=True)
    input("Press Enter to exit...")
    sys.exit(1)

# ── ANSI color layer ──────────────────────────────────────────────────────────
print("[BOOT] Initialising color layer...", flush=True)
_color_on = True

class _C:
    RST  = "\033[0m"
    BOLD = "\033[1m"
    DIM  = "\033[2m"
    RED  = "\033[91m"
    GRN  = "\033[92m"
    YLW  = "\033[93m"
    BLU  = "\033[94m"
    CYN  = "\033[96m"

def _col(code: str, text: str) -> str:
    return f"{code}{text}{_C.RST}" if _color_on else text

def _init_color():
    global _color_on
    if IS_WIN:
        try:
            import ctypes
            k = ctypes.windll.kernel32
            k.SetConsoleMode(k.GetStdHandle(-11), 7)
        except Exception:
            _color_on = False

print("[BOOT] INIT COMPLETE — entering main()", flush=True)


# ── UI helpers ────────────────────────────────────────────────────────────────
def banner():
    w = 56
    print(_col(_C.BLU + _C.BOLD, "\n" + "═" * w))
    print(_col(_C.BLU + _C.BOLD, "  MinePanel — Installer"))
    print(_col(_C.DIM,            "  https://github.com/xst3x/minepanel"))
    print(_col(_C.BLU + _C.BOLD, "═" * w))

def step(msg: str):
    print(_col(_C.BLU, f"\n▶  {msg}"), flush=True)

def ok(msg: str):
    print(_col(_C.GRN, f"   ✓  {msg}"), flush=True)

def info(msg: str):
    print(_col(_C.DIM, f"   ·  {msg}"), flush=True)

def warn(msg: str):
    print(_col(_C.YLW, f"   ⚠  {msg}"), flush=True)

def abort(msg: str):
    print(_col(_C.RED, f"\n   ✗  {msg}\n"), flush=True)
    sys.exit(1)

def ask(prompt: str, default: str = "") -> str:
    hint = f" [{default}]" if default else ""
    try:
        val = input(_col(_C.CYN, f"   ?  {prompt}{hint}: ")).strip()
        return val if val else default
    except (KeyboardInterrupt, EOFError):
        print()
        sys.exit(0)

def ask_bool(prompt: str, default: bool = True) -> bool:
    hint = "Y/n" if default else "y/N"
    val = ask(f"{prompt} ({hint})")
    return val.lower().startswith("y") if val else default

def ask_port(default: int = 8080) -> int:
    while True:
        raw = ask("Port", str(default))
        try:
            port = int(raw)
            if 1024 <= port <= 65535:
                return port
            warn("Port must be between 1024 and 65535.")
        except ValueError:
            warn("Enter a valid integer.")


# ── Subprocess helpers ────────────────────────────────────────────────────────
def _run(args, cwd=None, capture=False, check=True, env=None):
    if IS_WIN:
        parts = []
        for a in (args if isinstance(args, list) else [args]):
            s = str(a)
            parts.append(f'"{s}"' if (" " in s and not s.startswith('"')) else s)
        cmd       = " ".join(parts)
        use_shell = True
    else:
        cmd       = args
        use_shell = False

    kwargs: dict = dict(cwd=str(cwd) if cwd else None, env=env, shell=use_shell)
    if capture:
        kwargs |= dict(stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    result = subprocess.run(cmd, **kwargs)

    if check and result.returncode != 0:
        label = (args[0] if isinstance(args, list) else str(args))
        abort(f"Command failed (exit {result.returncode}): {label}")

    return result

def _which(name: str):
    return shutil.which(name)


# ── Linux package manager wrapper ─────────────────────────────────────────────
def _sudo(*args):
    return list(args) if IS_ROOT else ["sudo", *args]

def _linux_pkg(*packages: str):
    pkg_list = list(packages)
    if _which("apt-get"):
        _run(_sudo("apt-get", "install", "-y", *pkg_list))
    elif _which("dnf"):
        _run(_sudo("dnf", "install", "-y", *pkg_list))
    elif _which("yum"):
        _run(_sudo("yum", "install", "-y", *pkg_list))
    else:
        abort(
            f"No supported package manager found (apt/dnf/yum).\n"
            f"   Install manually: {' '.join(pkg_list)}"
        )


# ── Step 1 — Dependency checks ────────────────────────────────────────────────
def check_git():
    step("Checking git")
    if not _which("git"):
        if IS_LINUX:
            info("Installing git…")
            _linux_pkg("git")
        else:
            abort("git not found. Install from https://git-scm.com and re-run.")
    r = _run(["git", "--version"], capture=True)
    ok(r.stdout.strip())


def check_node():
    step(f"Checking Node.js (≥{MIN_NODE_MAJOR})")
    if not _which("node"):
        if IS_LINUX:
            _install_node_linux()
        else:
            abort(
                f"Node.js not found. Install v{MIN_NODE_MAJOR}+ from "
                "https://nodejs.org and re-run."
            )

    r   = _run(["node", "--version"], capture=True)
    ver = r.stdout.strip().lstrip("v")
    major = int(ver.split(".")[0])
    if major < MIN_NODE_MAJOR:
        abort(
            f"Node.js v{MIN_NODE_MAJOR}+ required — found v{ver}.\n"
            "   Update at https://nodejs.org"
        )
    ok(f"Node.js v{ver}")


def _install_node_linux():
    info(f"Node.js not found — installing v{MIN_NODE_MAJOR}.x via NodeSource…")
    if not _which("curl"):
        _linux_pkg("curl")
    _run([
        "bash", "-c",
        f"curl -fsSL https://deb.nodesource.com/setup_{MIN_NODE_MAJOR}.x | sudo -E bash -",
    ])
    _linux_pkg("nodejs")


def check_npm():
    step("Checking npm")
    if not _which("npm"):
        abort("npm not found. Re-install Node.js from https://nodejs.org")
    r = _run(["npm", "--version"], capture=True)
    ok(f"npm v{r.stdout.strip()}")


def check_jdk():
    step("Checking JDK 21+")
    if _which("javac"):
        r = _run(["java", "-version"], capture=True)
        first_line = (r.stderr or r.stdout or "").strip().splitlines()[0] if (r.stderr or r.stdout) else "unknown"
        ok(f"JDK present — {first_line}")
        return

    info("javac not found (full JDK required for Minecraft server processes).")
    if IS_LINUX:
        _install_jdk_linux()
    else:
        warn("Download Temurin JDK 21 from https://adoptium.net")
        warn("After installing, restart this script.")
        if not ask_bool("Continue without JDK for now?", default=False):
            sys.exit(0)


def _install_jdk_linux():
    info("Installing JDK…")
    if _which("apt-get"):
        _linux_pkg("default-jdk")
    elif _which("dnf"):
        _linux_pkg("java-21-openjdk-devel")
    else:
        warn(
            "Could not auto-install JDK.\n"
            "   Get it from https://adoptium.net (Temurin 21 LTS)."
        )


# ── Step 2 — Clone repository ─────────────────────────────────────────────────
def clone_repo(install_dir: Path):
    step("Cloning repository")

    if (install_dir / ".git").is_dir():
        ok(f"Repository already present at {install_dir}")
        if ask_bool("Pull latest changes?", default=False):
            _run(["git", "pull"], cwd=install_dir)
            ok("Up to date.")
        return

    if install_dir.exists() and any(install_dir.iterdir()):
        abort(
            f"Directory '{install_dir}' exists and is not empty.\n"
            "   Choose a different install path or remove the directory first."
        )

    install_dir.mkdir(parents=True, exist_ok=True)
    info(f"Cloning {REPO_URL} → {install_dir}")
    _run(["git", "clone", REPO_URL, str(install_dir)])
    ok("Cloned successfully.")


# ── Step 3 — .env file ───────────────────────────────────────────────────────
_SECRET_CHARS = string.ascii_letters + string.digits + "!@#$%^&*-_=+"


def _gen_secret(length: int = 64) -> str:
    return "".join(secrets.choice(_SECRET_CHARS) for _ in range(length))


def configure_env(install_dir: Path, port: int, https_enabled: bool):
    step("Writing .env")
    env_path = install_dir / ".env"

    if env_path.exists():
        if not ask_bool(".env already exists. Overwrite?", default=False):
            ok(".env kept unchanged.")
            return

    jwt_secret  = _gen_secret()
    csrf_secret = _gen_secret()
    while csrf_secret == jwt_secret:
        csrf_secret = _gen_secret()

    lines = [
        f"JWT_SECRET={jwt_secret}",
        f"CSRF_SECRET={csrf_secret}",
        f"PORT={port}",
        "RATE_LIMIT=100",
        "ALLOWED_ORIGINS=*",
    ]

    if https_enabled:
        key_file, cert_file = _gen_ssl_cert(install_dir / "certs")
        lines += [
            "HTTPS=true",
            f"HTTPS_KEY=certs/{key_file.name}",
            f"HTTPS_CERT=certs/{cert_file.name}",
        ]
    else:
        lines.append("HTTPS=false")

    env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    ok(f".env written ({len(lines)} variables)")


# ── OpenSSL installation helpers ──────────────────────────────────────────────
def _refresh_openssl_path_windows():
    candidates = [
        r"C:\Program Files\OpenSSL-Win64\bin",
        r"C:\Program Files\OpenSSL\bin",
        r"C:\OpenSSL-Win64\bin",
        r"C:\OpenSSL\bin",
    ]
    current = os.environ.get("PATH", "")
    extras  = [c for c in candidates if Path(c).is_dir() and c not in current]
    if extras:
        os.environ["PATH"] = os.pathsep.join(extras) + os.pathsep + current
        info(f"Added to PATH: {', '.join(extras)}")


def _install_openssl_windows() -> bool:
    info("OpenSSL not found — attempting automatic installation…")

    if _which("winget"):
        info("Trying winget…")
        r = _run(
            ["winget", "install", "--id", "ShiningLight.OpenSSL.Light",
             "--silent", "--accept-package-agreements", "--accept-source-agreements"],
            capture=True, check=False,
        )
        _refresh_openssl_path_windows()
        if _which("openssl"):
            ok("OpenSSL installed via winget.")
            return True
        warn(f"winget exited {r.returncode} — trying next method…")

    if _which("choco"):
        info("Trying Chocolatey…")
        r = _run(["choco", "install", "openssl", "-y"], capture=True, check=False)
        _refresh_openssl_path_windows()
        if _which("openssl"):
            ok("OpenSSL installed via Chocolatey.")
            return True
        warn(f"choco exited {r.returncode} — trying direct download…")

    msi_url = "https://slproweb.com/download/Win64OpenSSL_Light-3_3_1.msi"
    tmp_msi = Path(tempfile.gettempdir()) / "Win64OpenSSL_Light.msi"

    info("Downloading OpenSSL installer from slproweb.com…")
    try:
        urllib.request.urlretrieve(msi_url, str(tmp_msi))
        info("Download complete — running silent MSI install (may take ~30 s)…")
    except Exception as dl_err:
        warn(f"Download failed: {dl_err}")
        return False

    r = _run(
        ["msiexec", "/i", str(tmp_msi),
         "/quiet", "/qn", "/norestart", "ADDLOCAL=ALL"],
        capture=True, check=False,
    )
    try:
        tmp_msi.unlink()
    except Exception:
        pass

    if r.returncode not in (0, 3010):
        warn(f"MSI installer exited with code {r.returncode}")
        return False

    _refresh_openssl_path_windows()
    if _which("openssl"):
        ok("OpenSSL installed via direct download.")
        return True

    warn("MSI installed but openssl.exe still not found on PATH.")
    return False


def _gen_ssl_cert(cert_dir: Path):
    step("Generating self-signed TLS certificate (10-year validity)")

    openssl = _which("openssl")

    if not openssl:
        if IS_LINUX:
            info("Installing openssl via package manager…")
            _linux_pkg("openssl")
            openssl = _which("openssl")
        elif IS_WIN:
            if _install_openssl_windows():
                openssl = _which("openssl")

    if not openssl:
        abort(
            "openssl could not be installed automatically.\n"
            "   Windows: https://slproweb.com/products/Win32OpenSSL.html\n"
            "   Linux:   sudo apt install openssl\n"
            "   Then re-run the installer."
        )

    cert_dir.mkdir(parents=True, exist_ok=True)
    key_path  = cert_dir / "key.pem"
    cert_path = cert_dir / "cert.pem"

    if key_path.exists() and cert_path.exists():
        ok("Existing certificates reused.")
        return key_path, cert_path

    _run([
        openssl, "req", "-x509", "-newkey", "rsa:4096",
        "-keyout", str(key_path),
        "-out",    str(cert_path),
        "-days",   "3650",
        "-nodes",
        "-subj",   "/CN=minepanel",
    ])
    ok(f"Certificate written to {cert_dir}")
    return key_path, cert_path


# ── Step 4 — Install npm dependencies ────────────────────────────────────────
def install_backend(install_dir: Path):
    step("Installing backend dependencies")
    _run(["npm", "install", "--prefer-offline"], cwd=install_dir)
    ok("Backend packages installed.")


def install_frontend(install_dir: Path):
    step("Building frontend (Vite)")
    fe_dir = install_dir / "src" / "frontend"
    if not fe_dir.is_dir():
        abort(f"Frontend directory not found: {fe_dir}")
    _run(["npm", "install"], cwd=fe_dir)
    _run(["npm", "run", "build"], cwd=fe_dir)
    ok("Frontend built and ready.")


# ── Step 5 — Service setup ────────────────────────────────────────────────────
def setup_service(install_dir: Path):
    step("Setting up persistent service")
    if IS_LINUX:
        _setup_systemd(install_dir)
    else:
        _setup_windows(install_dir)


def _setup_systemd(install_dir: Path):
    node_bin = _which("node") or "/usr/bin/node"
    entry    = install_dir / "minepanel_main.js"
    svc_name = "minepanel"
    svc_file = Path(f"/etc/systemd/system/{svc_name}.service")
    tmp_file = Path("/tmp/minepanel.service")

    unit = (
        "[Unit]\n"
        "Description=MinePanel — Minecraft Server Management Panel\n"
        "After=network.target\n"
        "\n"
        "[Service]\n"
        "Type=simple\n"
        f"WorkingDirectory={install_dir}\n"
        f"ExecStart={node_bin} {entry}\n"
        "Restart=always\n"
        "RestartSec=5\n"
        "StandardOutput=journal\n"
        "StandardError=journal\n"
        "SyslogIdentifier=minepanel\n"
        "\n"
        "[Install]\n"
        "WantedBy=multi-user.target\n"
    )

    tmp_file.write_text(unit, encoding="utf-8")
    _run(_sudo("mv", str(tmp_file), str(svc_file)))
    _run(_sudo("systemctl", "daemon-reload"))
    _run(_sudo("systemctl", "enable", "--now", svc_name))
    ok(f"systemd unit '{svc_name}' enabled and running.")
    info(f"Logs  →  journalctl -u {svc_name} -f")
    info(f"Stop  →  sudo systemctl stop {svc_name}")


def _setup_windows(install_dir: Path):
    """
    Windows service strategy:
      - Write Start.bat  — double-click to start MinePanel in a visible console window
      - Write Stop.bat   — kills the node process cleanly
      - Optionally register PM2 as a background auto-start (no blank CMD window)
      - Start MinePanel NOW in a new visible console window via 'start cmd /k'
        so the user sees output immediately, and can close it normally with Ctrl+C.
    """
    node_bin = _which("node") or "node"
    entry    = install_dir / "minepanel_main.js"

    # ── Write Start.bat ───────────────────────────────────────────────────────
    start_bat = install_dir / "Start.bat"
    start_bat.write_text(
        "@echo off\n"
        "title MinePanel\n"
        f'cd /d "{install_dir}"\n'
        f'"{node_bin}" "{entry}"\n'
        "pause\n",
        encoding="utf-8"
    )
    ok(f"Start.bat written → {start_bat}")

    # ── Write Stop.bat ────────────────────────────────────────────────────────
    stop_bat = install_dir / "Stop.bat"
    stop_bat.write_text(
        "@echo off\n"
        "echo Stopping MinePanel...\n"
        'taskkill /F /IM node.exe /FI "WINDOWTITLE eq MinePanel" >nul 2>&1\n'
        "echo Done.\n"
        "pause\n",
        encoding="utf-8"
    )
    ok(f"Stop.bat written  → {stop_bat}")

    # ── Optional PM2 background auto-start ────────────────────────────────────
    # PM2 is set up with --no-autorestart so it acts as a watchdog only on
    # explicit start, preventing the blank-CMD-window issue.
    if _which("pm2"):
        info("PM2 found — registering for auto-start on Windows login…")
        _run(["pm2", "delete", APP_NAME], check=False)
        _run([
            "pm2", "start", str(entry),
            "--name", APP_NAME,
            "--cwd", str(install_dir),
            "--interpreter", node_bin,
            # Pipe output to PM2 log files instead of opening a console window
            "--log", str(install_dir / "logs" / "pm2.log"),
        ], check=False)
        _run(["pm2", "save"], check=False)
        ok("PM2 registered. Use  pm2 logs minepanel  to tail output.")
    else:
        info("PM2 not found — skipping background service registration.")
        info("To install PM2 (optional):  npm install -g pm2")

    # ── Start MinePanel NOW in a visible console ──────────────────────────────
    step("Starting MinePanel")
    info("Opening MinePanel in a new console window…")
    info("Close that window (or press Ctrl+C inside it) to stop the server.")

    # 'start' opens a new CMD window; /k keeps it open after node exits so the
    # user can read any error messages before closing.
    subprocess.Popen(
        f'start "MinePanel" cmd /k "{node_bin}" "{entry}"',
        shell=True,
        cwd=str(install_dir),
    )


# ── Health check ──────────────────────────────────────────────────────────────
def wait_for_health(port: int):
    step("Waiting for MinePanel to respond…")
    url = f"http://127.0.0.1:{port}/api/system/health"
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode    = ssl.CERT_NONE

    deadline = time.time() + HEALTH_TIMEOUT
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=3, context=ctx) as resp:
                if resp.status == 200:
                    ok("Panel is up and responding.")
                    return
        except Exception:
            pass
        time.sleep(2)
        print("   …", flush=True)

    warn(f"Panel did not respond within {HEALTH_TIMEOUT}s.")
    warn("Check the MinePanel console window for errors.")


# ── MAIN ──────────────────────────────────────────────────────────────────────
def main():
    print("[ENTER MAIN]", flush=True)
    _init_color()
    banner()

    # ── Gather configuration ──────────────────────────────────────────────────
    step("Configuration")

    default_dir = (
        Path(os.environ.get("LOCALAPPDATA", "C:/MinePanel")) / "MinePanel"
        if IS_WIN
        else Path("/opt/minepanel")
    )
    raw_dir     = ask("Install directory", str(default_dir))
    install_dir = Path(raw_dir).expanduser().resolve()

    port         = ask_port(default=8080)
    https_enable = ask_bool("Enable HTTPS (self-signed certificate)?", default=False)

    # ── System checks ─────────────────────────────────────────────────────────
    step("SYSTEM CHECK")
    check_git()
    check_node()
    check_npm()
    check_jdk()

    # ── Clone ─────────────────────────────────────────────────────────────────
    clone_repo(install_dir)

    # ── Configure ─────────────────────────────────────────────────────────────
    configure_env(install_dir, port, https_enable)

    # ── Install ───────────────────────────────────────────────────────────────
    install_backend(install_dir)
    install_frontend(install_dir)

    # ── Service + start ───────────────────────────────────────────────────────
    setup_service(install_dir)

    # ── Health check ──────────────────────────────────────────────────────────
    wait_for_health(port)

    # ── Done ──────────────────────────────────────────────────────────────────
    proto = "https" if https_enable else "http"
    print(_col(_C.GRN + _C.BOLD, "\n" + "═" * 56), flush=True)
    print(_col(_C.GRN + _C.BOLD, "  ✓  MinePanel installed successfully!"), flush=True)
    print(_col(_C.GRN + _C.BOLD, "═" * 56), flush=True)
    print(_col(_C.CYN, f"\n  Open  →  {proto}://localhost:{port}"), flush=True)
    if IS_WIN:
        print(_col(_C.CYN, f"  Start →  Start.bat"), flush=True)
        print(_col(_C.CYN, f"  Stop  →  Stop.bat\n"),  flush=True)
        input("Press Enter to close the installer...")


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[!] Installation cancelled by user.", flush=True)
        sys.exit(0)
    except SystemExit:
        raise
    except Exception as e:
        print(f"\n[FATAL ERROR] {repr(e)}", flush=True)
        import traceback
        traceback.print_exc()
        if IS_WIN:
            input("Press Enter to exit...")
        sys.exit(1)
