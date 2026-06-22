import sys
import json
import types
import time as py_time
import random as py_random
import builtins
import traceback

# Create mock minepanel module
minepanel = types.ModuleType("minepanel")

_context = {}

def send_command(server_id, cmd):
    print(json.dumps({"__minepanel_action__": "send_command", "server_id": server_id, "command": cmd}), flush=True)

def log(msg):
    print(json.dumps({"__minepanel_action__": "log", "message": msg}), flush=True)

def cpu_usage():
    return _context.get("metrics", {}).get("cpu_usage", 0.0)

def global_ram_usage():
    return _context.get("metrics", {}).get("global_ram_usage", 0.0)

def server_ram_usage(server_id):
    return _context.get("metrics", {}).get("server_ram_usage", 0.0)

def time():
    return py_time.time()

def random():
    return py_random.random()

minepanel.send_command = send_command
minepanel.log = log
minepanel.cpu_usage = cpu_usage
minepanel.global_ram_usage = global_ram_usage
minepanel.server_ram_usage = server_ram_usage
minepanel.time = time
minepanel.random = random

sys.modules["minepanel"] = minepanel

# Set up event system decorators
_event_handlers = {}

def event(name):
    def decorator(func):
        if name not in _event_handlers:
            _event_handlers[name] = []
        _event_handlers[name].append(func)
        return func
    return decorator

def safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    allowed_modules = ['minepanel', 'math', 'random', 'time', 'json']
    base_module = name.split('.')[0]
    if base_module not in allowed_modules:
        raise ImportError(f"Forbidden import: {name}")
    return __import__(name, globals, locals, fromlist, level)

# Build restricted builtins
safe_builtins = {}
safe_builtins['__import__'] = safe_import
allowed_builtins = [
    'abs', 'all', 'any', 'ascii', 'bin', 'bool', 'bytearray', 'bytes', 'callable',
    'chr', 'classmethod', 'complex', 'delattr', 'dict', 'dir', 'divmod', 'enumerate',
    'filter', 'float', 'format', 'frozenset', 'getattr', 'hasattr', 'hash', 'hex',
    'id', 'int', 'isinstance', 'issubclass', 'iter', 'len', 'list', 'map', 'max',
    'min', 'next', 'object', 'oct', 'ord', 'pow', 'print', 'range', 'repr',
    'reversed', 'round', 'set', 'setattr', 'slice', 'sorted', 'staticmethod',
    'str', 'sum', 'tuple', 'type', 'zip', 'Exception', 'ValueError', 'TypeError',
    'KeyError', 'IndexError', 'AttributeError', 'NameError', 'RuntimeError',
    'StopIteration', 'AssertionError'
]

for name in allowed_builtins:
    if hasattr(builtins, name):
        safe_builtins[name] = getattr(builtins, name)

def run_sandbox(context, code):
    global _context
    _context = context

    globals_dict = {
        "__builtins__": safe_builtins,
        "minepanel": minepanel,
        "event": event,
    }

    try:
        compiled = compile(code, "<script>", "exec")
        exec(compiled, globals_dict)
    except Exception as e:
        tb = traceback.format_exc()
        print(tb, file=sys.stderr, flush=True)
        sys.exit(1)

    event_name = context.get("event")
    
    # Fire event-based handlers
    if event_name and event_name in _event_handlers:
        for handler in _event_handlers[event_name]:
            try:
                handler(context)
            except Exception as e:
                print(traceback.format_exc(), file=sys.stderr, flush=True)
                sys.exit(1)

    # Run run(context) function if it exists
    if "run" in globals_dict and callable(globals_dict["run"]):
        try:
            globals_dict["run"](context)
        except Exception as e:
            print(traceback.format_exc(), file=sys.stderr, flush=True)
            sys.exit(1)

def main():
    # Read context and code from stdin
    try:
        first_line = sys.stdin.readline()
        if not first_line:
            print("[Sandbox Error] Missing context JSON", file=sys.stderr, flush=True)
            sys.exit(1)
        context = json.loads(first_line)
    except Exception as e:
        print(f"[Sandbox Error] Failed to parse context: {str(e)}", file=sys.stderr, flush=True)
        sys.exit(1)

    try:
        code = sys.stdin.read()
    except Exception as e:
        print(f"[Sandbox Error] Failed to read script code: {str(e)}", file=sys.stderr, flush=True)
        sys.exit(1)

    run_sandbox(context, code)

if __name__ == '__main__':
    main()
