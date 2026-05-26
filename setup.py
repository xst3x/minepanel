#!/usr/bin/env python3
"""
MinePanel Setup Script
Cross-platform installer for Windows and Linux.
"""

import os
import sys
import shutil
import platform
import subprocess
import sqlite3
import getpass
import json
import re
import time

# ── Colours ────────────────────────────────────────────────────────────────────
IS_WINDOWS = platform.system() == "Windows"

def supports_color():
    if IS_WINDOWS:
        try:
            import ctypes
            kernel32 = ctypes.windll.kernel32
            kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
            return True
        except Exception:
            return False
    return True

USE_COLOR = supports_color()

def c(text, code):
    if not USE_COLOR:
        return text
    return f"\033[{code}m{text}\033[0m"

def red(t):    return c(t, "91")
def green(t):  return c(t, "92")
def yellow(t): return c(t, "93")
def cyan(t):   return c(t, "96")
def bold(t):   return c(t, "1")
def dim(t):    return c(t, "2")

# ── Helpers ────────────────────────────────────────────────────────────────────
def clear():
    os.system("cls" if IS_WINDOWS else "clear")

def banner():
    print()
    print(cyan("╔══════════════════════════════════════════╗"))
    print(cyan("║") + bold("        MinePanel Setup Utility           ") + cyan("║"))
    print(cyan("╚══════════════════════════════════════════╝"))
    print()

def step(msg):
    print(f"  {cyan('›')} {msg}")

def ok(msg):
    print(f"  {green('✔')} {msg}")

def warn(msg):
    print(f"  {yellow('⚠')} {msg}")

def err(msg):
    print(f"  {red('✘')} {msg}")

def ask(prompt, default=None):
    hint = f" [{default}]" if default is not None else ""
    try:
        val = input(f"  {bold('?')} {prompt}{hint}: ").strip()
    except (KeyboardInterrupt, EOFError):
        print()
        sys.exit(0)
    return val if val else default

def ask_yn(prompt, default=True):
    hint = "Y/n" if default else "y/N"
    try:
        val = input(f"  {bold('?')} {prompt} [{hint}]: ").strip().lower()
    except (KeyboardInterrupt, EOFError):
        print()
        sys.exit(0)
    if val in ("y", "yes"):
        return True
    if val in ("n", "no"):
        return False
    return default

def run(cmd, cwd=None, capture=False):
    """Run a shell command. Returns (returncode, stdout) if capture else returncode."""
    kwargs = dict(cwd=cwd, shell=IS_WINDOWS)
    if capture:
        kwargs["stdout"] = subprocess.PIPE
        kwargs["stderr"] = subprocess.PIPE
        kwargs["text"] = True
    proc = subprocess.run(cmd if IS_WINDOWS else cmd, **kwargs)
    if capture:
        return proc.returncode, proc.stdout.strip()
    return proc.returncode

def require_admin():
    """Exit if not running as admin/root."""
    if IS_WINDOWS:
        import ctypes
        if not ctypes.windll.shell32.IsUserAnAdmin():
            err("Please run this script as Administrator (right-click -> Run as administrator).")
            sys.exit(1)
    else:
        if os.geteuid() != 0:
            err("Please run this script with sudo: sudo python3 setup.py")
            sys.exit(1)

# ── Node / npm detection & install ────────────────────────────────────────────
def check_node():
    step("Checking for Node.js ...")
    rc, ver = run(["node", "--version"], capture=True)
    if rc == 0:
        ok(f"Node.js found: {ver}")
        return True
    return False

def install_node():
    warn("Node.js not found. Attempting to install ...")
    if IS_WINDOWS:
        _install_node_windows()
    else:
        _install_node_linux()

def _install_node_windows():
    import urllib.request, tempfile
    url = "https://nodejs.org/dist/v20.14.0/node-v20.14.0-x64.msi"
    tmp = os.path.join(tempfile.gettempdir(), "node_installer.msi")
    step("Downloading Node.js installer ...")
    try:
        urllib.request.urlretrieve(url, tmp)
    except Exception as e:
        err(f"Download failed: {e}")
        err("Please download and install Node.js manually from https://nodejs.org")
        sys.exit(1)
    step("Running installer (this may take a moment) ...")
    rc = run(["msiexec", "/i", tmp, "/quiet", "/norestart"])
    os.remove(tmp)
    if rc != 0:
        err("Node.js installation failed. Please install it manually from https://nodejs.org")
        sys.exit(1)
    ok("Node.js installed.")

def _install_node_linux():
    managers = [
        (["apt-get", "-y", "update"], ["apt-get", "install", "-y", "nodejs", "npm"]),
        (None,                         ["dnf",     "install", "-y", "nodejs", "npm"]),
        (None,                         ["pacman",  "-Sy", "--noconfirm", "nodejs", "npm"]),
        (None,                         ["zypper",  "install", "-y", "nodejs", "npm"]),
    ]
    for pre, cmd in managers:
        if shutil.which(cmd[0]):
            if pre:
                run(pre)
            rc = run(cmd)
            if rc == 0:
                ok("Node.js installed via package manager.")
                return
    step("Trying nvm install ...")
    rc = run("curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash")
    if rc != 0:
        err("Could not install Node.js automatically.")
        err("Please install Node.js v18+ manually: https://nodejs.org")
        sys.exit(1)
    ok("nvm installed. Please restart your terminal and re-run setup.py.")
    sys.exit(0)

# ── OpenSSL / cert generation ──────────────────────────────────────────────────
def find_openssl():
    if shutil.which("openssl"):
        return "openssl"
    if IS_WINDOWS:
        candidates = [
            r"C:\Program Files\OpenSSL-Win64\bin\openssl.exe",
            r"C:\Program Files\Git\usr\bin\openssl.exe",
            r"C:\Program Files\OpenSSL\bin\openssl.exe",
        ]
        for c_ in candidates:
            if os.path.isfile(c_):
                return c_
    return None

def generate_certs(install_dir):
    certs_dir = os.path.join(install_dir, "certs")
    os.makedirs(certs_dir, exist_ok=True)
    key_path  = os.path.join(certs_dir, "key.pem")
    cert_path = os.path.join(certs_dir, "cert.pem")

    if os.path.isfile(key_path) and os.path.isfile(cert_path):
        ok("SSL certificates already exist, skipping generation.")
        return True

    ssl = find_openssl()
    if not ssl:
        warn("openssl not found - skipping certificate generation.")
        warn("HTTPS will be disabled. Install openssl and re-run setup to enable it.")
        return False

    step("Generating self-signed SSL certificate ...")
    cmd = [
        ssl, "req", "-x509", "-newkey", "rsa:4096",
        "-keyout", key_path, "-out", cert_path,
        "-days", "365", "-nodes",
        "-subj", "/CN=localhost"
    ]
    rc = run(cmd)
    if rc == 0:
        ok("SSL certificate generated.")
        return True
    warn("Certificate generation failed. HTTPS will be disabled.")
    return False

# ── File copying ───────────────────────────────────────────────────────────────
COPY_DIRS  = ["src", "assets"]
COPY_FILES = ["package.json", "package-lock.json", ".env.example"]

def copy_project(src_root, dest_dir):
    step(f"Copying project files to {dest_dir} ...")
    os.makedirs(dest_dir, exist_ok=True)

    for d in COPY_DIRS:
        s = os.path.join(src_root, d)
        t = os.path.join(dest_dir, d)
        if os.path.isdir(s):
            if os.path.exists(t):
                shutil.rmtree(t)
            shutil.copytree(s, t, ignore=shutil.ignore_patterns("node_modules", "__pycache__"))

    for f in COPY_FILES:
        s = os.path.join(src_root, f)
        if os.path.isfile(s):
            shutil.copy2(s, os.path.join(dest_dir, f))

    ok("Files copied.")

# ── .env writing ───────────────────────────────────────────────────────────────
def write_env(install_dir, backend_port, https_enabled):
    import secrets
    env_path = os.path.join(install_dir, ".env")

    if os.path.isfile(env_path):
        warn(".env already exists - updating PORT and HTTPS settings only.")
        with open(env_path, "r") as f:
            content = f.read()
        content = re.sub(r"^PORT=.*$",  f"PORT={backend_port}", content, flags=re.MULTILINE)
        content = re.sub(r"^HTTPS=.*$", f"HTTPS={'true' if https_enabled else 'false'}", content, flags=re.MULTILINE)
        with open(env_path, "w") as f:
            f.write(content)
        return

    jwt_secret = secrets.token_hex(32)
    lines = [
        f"PORT={backend_port}",
        f"JWT_SECRET={jwt_secret}",
        "JWT_EXPIRES_IN=24h",
        "ALLOWED_ORIGINS=*",
        f"HTTPS={'true' if https_enabled else 'false'}",
        "HTTPS_KEY=certs/key.pem",
        "HTTPS_CERT=certs/cert.pem",
    ]
    with open(env_path, "w") as f:
        f.write("\n".join(lines) + "\n")
    ok(".env created with a random JWT_SECRET.")

# ── npm install ────────────────────────────────────────────────────────────────
def npm_install(install_dir):
    step("Installing npm dependencies (this may take a minute) ...")
    npm = "npm.cmd" if IS_WINDOWS else "npm"
    rc = run([npm, "install", "--omit=dev"], cwd=install_dir)
    if rc != 0:
        err("npm install failed.")
        sys.exit(1)
    ok("Dependencies installed.")

# ── Startup service ────────────────────────────────────────────────────────────
def install_startup_windows(install_dir):
    node_exe = shutil.which("node") or "node"
    entry    = os.path.join(install_dir, "src", "index.js")
    task_xml = f"""<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers><BootTrigger><Enabled>true</Enabled></BootTrigger></Triggers>
  <Principals><Principal><RunLevel>HighestAvailable</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
  </Settings>
  <Actions><Exec>
    <Command>{node_exe}</Command>
    <Arguments>"{entry}"</Arguments>
    <WorkingDirectory>{install_dir}</WorkingDirectory>
  </Exec></Actions>
</Task>"""
    xml_path = os.path.join(install_dir, "minepanel_task.xml")
    with open(xml_path, "w", encoding="utf-16") as f:
        f.write(task_xml)
    rc = run(["schtasks", "/Create", "/TN", "MinePanel", "/XML", xml_path, "/F"])
    os.remove(xml_path)
    if rc == 0:
        ok("Startup task created (Task Scheduler -> MinePanel).")
    else:
        warn("Failed to create startup task. Start MinePanel manually with: npm start")

def install_startup_linux(install_dir):
    node_exe = shutil.which("node") or "/usr/bin/node"
    entry    = os.path.join(install_dir, "src", "index.js")
    service  = f"""[Unit]
Description=MinePanel Minecraft Server Manager
After=network.target

[Service]
Type=simple
WorkingDirectory={install_dir}
ExecStart={node_exe} {entry}
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=minepanel
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
"""
    svc_path = "/etc/systemd/system/minepanel.service"
    with open(svc_path, "w") as f:
        f.write(service)
    run(["systemctl", "daemon-reload"])
    run(["systemctl", "enable", "minepanel"])
    ok("systemd service created and enabled (minepanel.service).")
    ok("Start now with: sudo systemctl start minepanel")

def install_startup(install_dir):
    if IS_WINDOWS:
        install_startup_windows(install_dir)
    else:
        install_startup_linux(install_dir)

# ── DB helpers ─────────────────────────────────────────────────────────────────
def find_db(install_dir):
    candidates = [
        os.path.join(install_dir, "data", "minepanel.db"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "minepanel.db"),
    ]
    for p in candidates:
        if os.path.isfile(p):
            return p
    return None

def hash_password_py(plain):
    """Hash password using Node.js bcrypt (avoids needing bcrypt in Python)."""
    safe = plain.replace("'", "\\'")
    script = f"const b=require('bcrypt');b.hash('{safe}',10).then(h=>process.stdout.write(h));"
    node = "node.exe" if IS_WINDOWS else "node"
    rc, hashed = run([node, "-e", script], capture=True)
    if rc != 0 or not hashed.startswith("$2"):
        return None
    return hashed

# ── Password reset ─────────────────────────────────────────────────────────────
def reset_password_menu(install_dir):
    db_path = find_db(install_dir)
    if not db_path:
        err("Database not found. Has MinePanel been run at least once?")
        input("\n  Press Enter to continue...")
        return

    conn = sqlite3.connect(db_path)
    cur  = conn.cursor()
    cur.execute("SELECT id, username, role FROM users ORDER BY id")
    users = cur.fetchall()

    if not users:
        warn("No users found in the database.")
        conn.close()
        input("\n  Press Enter to continue...")
        return

    print()
    print(f"  {bold('Users in database:')}")
    for uid, uname, role in users:
        print(f"    {dim(str(uid) + '.')}  {uname}  {dim('(' + role + ')')}")

    print()
    choice = ask("Enter the ID of the user to reset")
    try:
        uid = int(choice)
    except (ValueError, TypeError):
        err("Invalid ID.")
        conn.close()
        input("\n  Press Enter to continue...")
        return

    row = cur.execute("SELECT username FROM users WHERE id=?", (uid,)).fetchone()
    if not row:
        err(f"No user with ID {uid}.")
        conn.close()
        input("\n  Press Enter to continue...")
        return

    username = row[0]
    print(f"\n  Resetting password for: {bold(username)}")
    try:
        new_pass = getpass.getpass("  New password: ")
        confirm  = getpass.getpass("  Confirm password: ")
    except (KeyboardInterrupt, EOFError):
        print()
        conn.close()
        return

    if new_pass != confirm:
        err("Passwords do not match.")
        conn.close()
        input("\n  Press Enter to continue...")
        return

    if len(new_pass) < 6:
        err("Password must be at least 6 characters.")
        conn.close()
        input("\n  Press Enter to continue...")
        return

    step("Hashing password via Node.js bcrypt ...")
    hashed = hash_password_py(new_pass)
    if not hashed:
        err("Failed to hash password. Is Node.js installed and are you in the install directory?")
        conn.close()
        input("\n  Press Enter to continue...")
        return

    cur.execute("UPDATE users SET password=? WHERE id=?", (hashed, uid))
    conn.commit()
    conn.close()
    ok(f"Password for '{username}' has been reset successfully.")
    input("\n  Press Enter to continue...")

# ── HTTPS helpers (shared by Install and Enable HTTPS menu) ───────────────────
def _env_set(content, key, value):
    """Update or append a key=value line in .env content string."""
    if re.search(rf"^{key}=", content, flags=re.MULTILINE):
        return re.sub(rf"^{key}=.*$", f"{key}={value}", content, flags=re.MULTILINE)
    return content.rstrip() + f"\n{key}={value}\n"

def apply_https(install_dir):
    """Generate certs and patch .env with HTTPS=true. Returns True on success."""
    if not generate_certs(install_dir):
        return False
    env_path = os.path.join(install_dir, ".env")
    with open(env_path, "r") as f:
        content = f.read()
    content = _env_set(content, "HTTPS",      "true")
    content = _env_set(content, "HTTPS_KEY",  "certs/key.pem")
    content = _env_set(content, "HTTPS_CERT", "certs/cert.pem")
    with open(env_path, "w") as f:
        f.write(content)
    ok(".env updated with HTTPS=true and cert paths.")
    return True

def disable_https_in_env(install_dir):
    """Flip HTTPS=false in .env (called when cert generation fails during install)."""
    env_path = os.path.join(install_dir, ".env")
    with open(env_path, "r") as f:
        content = f.read()
    with open(env_path, "w") as f:
        f.write(_env_set(content, "HTTPS", "false"))

# ── Enable HTTPS menu action ──────────────────────────────────────────────────
def menu_enable_https(source_root):
    clear()
    banner()
    print(f"  {bold('=== Enable HTTPS ===')}")
    print(f"  {dim('Generates a self-signed SSL certificate and updates .env')}\n")

    install_dir = ask("MinePanel installation directory", source_root)
    install_dir = os.path.expandvars(os.path.expanduser(install_dir))

    if not os.path.isfile(os.path.join(install_dir, ".env")):
        err(".env file not found in that directory. Is MinePanel installed there?")
        input("\n  Press Enter to continue...")
        return

    if not apply_https(install_dir):
        err("Could not generate SSL certificates. Install openssl and try again.")
        input("\n  Press Enter to continue...")
        return

    with open(os.path.join(install_dir, ".env")) as f:
        content = f.read()
    port_match = re.search(r"^PORT=(\d+)", content, flags=re.MULTILINE)
    port = port_match.group(1) if port_match else "8082"

    print()
    print(f"  {green('HTTPS is now enabled!')}")
    print(f"  Restart MinePanel and open: {cyan('https://localhost:' + port)}")
    print(f"  {dim('Browser will warn about self-signed cert - click Advanced -> Proceed.')}")
    print()
    input("  Press Enter to continue...")

# ── Delete database ────────────────────────────────────────────────────────────
def delete_database(install_dir):
    db_path = find_db(install_dir)
    if not db_path:
        warn("Database file not found - nothing to delete.")
        input("\n  Press Enter to continue...")
        return

    print()
    warn(red("WARNING: This will permanently delete ALL data (users, servers, settings)."))
    warn(red("This action CANNOT be undone."))
    print()
    confirm = ask("Type DELETE (in caps) to confirm")
    if confirm != "DELETE":
        warn("Cancelled.")
        input("\n  Press Enter to continue...")
        return

    try:
        os.remove(db_path)
        ok("Database deleted. It will be recreated fresh on next startup.")
    except Exception as e:
        err(f"Could not delete database: {e}")

    input("\n  Press Enter to continue...")

# ── Defaults ───────────────────────────────────────────────────────────────────
def default_install_dir():
    if IS_WINDOWS:
        return os.path.join(os.environ.get("ProgramFiles", r"C:\Program Files"), "MinePanel")
    return "/opt/minepanel"

def find_source_root():
    """Return the project root (directory containing package.json)."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    for candidate in [script_dir, os.path.dirname(script_dir)]:
        if os.path.isfile(os.path.join(candidate, "package.json")):
            return candidate
    return script_dir

# ══════════════════════════════════════════════════════════════════════════════
# MENU ACTIONS
# ══════════════════════════════════════════════════════════════════════════════

def menu_install(source_root):
    clear()
    banner()
    print(f"  {bold('=== Install MinePanel ===')}\\n")

    require_admin()

    # Destination
    default_dir = default_install_dir()
    install_dir = ask("Installation directory", default_dir)
    install_dir = os.path.expandvars(os.path.expanduser(install_dir))

    # Port
    print()
    backend_port = ask("Backend port (API + WebSocket)", "8082")
    try:
        int(backend_port)
    except (ValueError, TypeError):
        err("Invalid port number.")
        input("\n  Press Enter to continue...")
        return

    # HTTPS
    print()
    want_https = ask_yn("Enable HTTPS? (self-signed cert, good for local/dev)", True)

    # Startup
    print()
    want_startup = ask_yn("Start MinePanel automatically on system boot?", True)

    # Summary
    print()
    print(f"  {bold('Summary:')}")
    print(f"    Install dir  : {install_dir}")
    print(f"    Backend port : {backend_port}")
    print(f"    HTTPS        : {'yes' if want_https else 'no'}")
    print(f"    Auto-start   : {'yes' if want_startup else 'no'}")
    print()
    if not ask_yn("Proceed with installation?", True):
        return

    print()

    # 1. Node.js
    if not check_node():
        install_node()
        if not check_node():
            err("Node.js still not available. Please install it manually.")
            sys.exit(1)

    # 2. Copy source files
    copy_project(source_root, install_dir)

    # 3. Write .env
    write_env(install_dir, backend_port, want_https)

    # 4. HTTPS certs
    if want_https:
        if not apply_https(install_dir):
            disable_https_in_env(install_dir)
            want_https = False

    # 5. npm install
    npm_install(install_dir)

    # 6. Startup
    if want_startup:
        install_startup(install_dir)

    # Done
    print()
    print(cyan("  ╔═════════════════════════════════════════╗"))
    print(cyan("  ║") + green(bold("   MinePanel installed successfully!     ")) + cyan("║"))
    print(cyan("  ╚═════════════════════════════════════════╝"))
    print()
    proto = "https" if want_https else "http"
    print(f"  Panel URL  ->  {cyan(proto + '://localhost:' + str(backend_port))}")
    print()
    if not want_startup:
        print(f"  To start MinePanel manually:")
        print(f"    cd \"{install_dir}\"")
        print(f"    npm start")
        print()
    if want_https:
        print(f"  {dim('Note: Browser will warn about self-signed cert.')}")
        print(f"  {dim('Click Advanced -> Proceed to localhost (safe to ignore for local use).')}")
        print()
    input("  Press Enter to exit...")


def menu_reset_password(source_root):
    clear()
    banner()
    print(f"  {bold('=== Reset User Password ===')}")
    print(f"  {dim('Last resort - bypasses login. Use if you forgot your password.')}\n")
    install_dir = ask("MinePanel installation directory", default_install_dir())
    install_dir = os.path.expandvars(os.path.expanduser(install_dir))
    reset_password_menu(install_dir)


def menu_delete_database(source_root):
    clear()
    banner()
    print(f"  {bold('=== Delete Database ===')}")
    print(f"  {dim('Removes ALL users, servers, and settings permanently.')}\n")
    install_dir = ask("MinePanel installation directory", default_install_dir())
    install_dir = os.path.expandvars(os.path.expanduser(install_dir))
    delete_database(install_dir)


# ══════════════════════════════════════════════════════════════════════════════
# ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════

def main():
    source_root = find_source_root()

    while True:
        clear()
        banner()
        print(f"  {bold('What would you like to do?')}\n")
        print(f"  {cyan('1')}  Install MinePanel")
        print(f"  {cyan('2')}  Reset user password  {dim('(last resort if you forgot your password)')}")
        print(f"  {cyan('3')}  Delete database       {dim('(removes ALL data - cannot be undone)')}")
        print(f"  {cyan('4')}  Enable HTTPS          {dim('(generate certs + update .env)')}")
        print(f"  {cyan('5')}  Exit")
        print()

        choice = ask("Select an option")

        if choice == "1":
            menu_install(source_root)
        elif choice == "2":
            menu_reset_password(source_root)
        elif choice == "3":
            menu_delete_database(source_root)
        elif choice == "4":
            menu_enable_https(source_root)
        elif choice == "5":
            print()
            print(f"  {dim('Goodbye!')}")
            print()
            sys.exit(0)
        else:
            warn("Invalid option, please choose 1-5.")
            time.sleep(1)


if __name__ == "__main__":
    main()
