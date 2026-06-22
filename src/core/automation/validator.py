import ast
import json
import sys

class SandboxValidator(ast.NodeVisitor):
    def __init__(self):
        self.errors = []
        self.has_minepanel_import = False

    def visit_Import(self, node):
        for name in node.names:
            self.check_module(name.name, node.lineno)
        self.generic_visit(node)

    def visit_ImportFrom(self, node):
        if node.module:
            self.check_module(node.module, node.lineno)
        self.generic_visit(node)

    def check_module(self, module_name, lineno):
        forbidden = [
            'os', 'sys', 'subprocess', 'psutil', 'socket', 'pathlib',
            'shutil', 'urllib', 'requests', 'builtins', 'ctypes', 'threading',
            'multiprocessing', 'concurrent', 'asyncio', 'socketserver', 'http'
        ]
        if module_name == 'minepanel':
            self.has_minepanel_import = True
            return
        
        base_mod = module_name.split('.')[0]
        if base_mod in forbidden:
            self.errors.append(f"Forbidden import: {module_name} at line {lineno}")

    def visit_Call(self, node):
        # Prevent calling raw builtins that compromise the environment
        if isinstance(node.func, ast.Name):
            name = node.func.id
            if name in ['eval', 'exec', 'compile', 'open', '__import__', 'getattr', 'setattr', 'delattr', 'input']:
                self.errors.append(f"Forbidden function call: '{name}' at line {node.lineno}")
        self.generic_visit(node)

    def visit_Attribute(self, node):
        # Prevent accessing double-underscore internal properties/methods
        if node.attr.startswith('__') and node.attr.endswith('__'):
            self.errors.append(f"Forbidden property access: '{node.attr}' at line {node.lineno}")
        
        # Verify minepanel API calls
        if isinstance(node.value, ast.Name) and node.value.id == 'minepanel':
            allowed_apis = ['send_command', 'log', 'cpu_usage', 'global_ram_usage', 'server_ram_usage', 'time', 'random']
            if node.attr not in allowed_apis:
                self.errors.append(f"AttributeError: minepanel has no attribute '{node.attr}' at line {node.lineno}")
        
        self.generic_visit(node)

    def visit_FunctionDef(self, node):
        # Scan decorators to ensure only @event is used and has a valid minecraft event name
        for decorator in node.decorator_list:
            if isinstance(decorator, ast.Call):
                dec_func = decorator.func
                dec_name = self.get_decorator_name(dec_func)
                if dec_name == 'event':
                    # Validate event name argument
                    if len(decorator.args) == 1 and isinstance(decorator.args[0], ast.Constant):
                        event_name = decorator.args[0].value
                        valid_events = ['player_join', 'player_leave', 'player_chat', 'server_ready', 'server_stop']
                        if event_name not in valid_events:
                            self.errors.append(f"Undefined event decorator: '{event_name}' at line {decorator.lineno}")
                    else:
                        self.errors.append(f"Invalid @event decorator syntax at line {decorator.lineno}")
                else:
                    self.errors.append(f"Undefined event decorator: '{dec_name}' at line {decorator.lineno}")
            else:
                dec_name = self.get_decorator_name(decorator)
                self.errors.append(f"Undefined event decorator: '{dec_name}' at line {decorator.lineno}")
        self.generic_visit(node)

    def get_decorator_name(self, node):
        if isinstance(node, ast.Name):
            return node.id
        elif isinstance(node, ast.Attribute):
            return f"{self.get_decorator_name(node.value)}.{node.attr}"
        return "unknown"

def main():
    try:
        code = sys.stdin.read()
    except Exception as e:
        print(json.dumps({"valid": False, "errors": [f"Failed to read input: {str(e)}"]}))
        return

    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        print(json.dumps({
            "valid": False,
            "errors": [f"SyntaxError: {e.msg} at line {e.lineno}, col {e.offset}"]
        }))
        return
    except Exception as e:
        print(json.dumps({
            "valid": False,
            "errors": [f"AST Parsing Error: {str(e)}"]
        }))
        return

    validator = SandboxValidator()
    validator.visit(tree)

    if validator.errors:
        print(json.dumps({"valid": False, "errors": validator.errors}))
    else:
        print(json.dumps({"valid": True, "errors": []}))

if __name__ == '__main__':
    main()
