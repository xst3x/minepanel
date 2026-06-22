\# Server Automations - Developer Documentation



Complete reference for the MinePanel automation system. Detailed explanation of every event, function, and component.



\## Architecture



The automation system consists of three components:



\### 1. \*\*Validator\*\* (`src/core/automation/validator.py`)



Validates Python code before execution using AST parsing:



\- \*\*Forbidden imports:\*\* `os`, `sys`, `subprocess`, `psutil`, `socket`, `pathlib`, `shutil`, `urllib`, `requests`, `builtins`, `ctypes`, `threading`, `multiprocessing`, `concurrent`, `asyncio`, `socketserver`, `http`

\- \*\*Forbidden functions:\*\* `eval`, `exec`, `compile`, `open`, `\_\_import\_\_`, `getattr`, `setattr`, `delattr`, `input`

\- \*\*Forbidden attributes:\*\* Double-underscore properties (`\_\_name\_\_`, `\_\_class\_\_`, etc.)

\- \*\*Event decorator validation:\*\* Only `@event('event\_name')` with valid event names



\---



\## Events Reference



\### `player\_join`



\*\*When:\*\* Player joins the server



\*\*Context:\*\*

```python

{

&#x20;   'event': 'player\_join',

&#x20;   'server\_id': 'uuid-...',

&#x20;   'player\_name': 'Username',

&#x20;   'player\_uuid': '550e8400-...',

&#x20;   'metrics': { 'cpu\_usage': 45.2, 'global\_ram\_usage': 72.5 }

}

```



\*\*Example:\*\*

```python

@event('player\_join')

def on\_join(ctx):

&#x20;   log(f"{ctx\['player\_name']} joined")

&#x20;   send\_command(ctx\['server\_id'], f"say Welcome {ctx\['player\_name']}!")

```



\---



\### `player\_leave`



\*\*When:\*\* Player disconnects from the server



\*\*Context:\*\* Same as `player\_join` but without `player\_uuid` sometimes



\*\*Example:\*\*

```python

@event('player\_leave')

def on\_leave(ctx):

&#x20;   send\_command(ctx\['server\_id'], f"say {ctx\['player\_name']} left")

```



\---



\### `player\_chat`



\*\*When:\*\* Player sends a message in chat



\*\*Context:\*\*

```python

{

&#x20;   'event': 'player\_chat',

&#x20;   'server\_id': 'uuid-...',

&#x20;   'player\_name': 'Username',

&#x20;   'player\_uuid': '550e8400-...',

&#x20;   'message': 'Hello everyone!',

&#x20;   'metrics': { ... }

}

```



\*\*Example (Anti-Spam):\*\*

```python

bad\_words = \['spam', 'bad']



@event('player\_chat')

def filter\_chat(ctx):

&#x20;   if any(word in ctx\['message'].lower() for word in bad\_words):

&#x20;       send\_command(ctx\['server\_id'], f"kick {ctx\['player\_name']} Watch language!")

```



\---



\### `server\_ready`



\*\*When:\*\* Server finishes loading and is ready for players



\*\*Context:\*\*

```python

{

&#x20;   'event': 'server\_ready',

&#x20;   'server\_id': 'uuid-...',

&#x20;   'server\_name': 'SMP',

&#x20;   'software': 'paper',  # or 'vanilla', 'bedrock', 'fabric', etc.

&#x20;   'version': '1.21.1',

&#x20;   'metrics': { ... }

}

```



\*\*Example:\*\*

```python

@event('server\_ready')

def on\_ready(ctx):

&#x20;   send\_command(ctx\['server\_id'], f"say Server online! ({ctx\['software']} {ctx\['version']})")

```



\---



\### `server\_stop`



\*\*When:\*\* Server is stopping or has stopped



\*\*Context:\*\*

```python

{

&#x20;   'event': 'server\_stop',

&#x20;   'server\_id': 'uuid-...',

&#x20;   'server\_name': 'SMP',

&#x20;   'metrics': { ... }

}

```



\---



\## API Functions - Complete Reference



\### `send\_command(server\_id, command)`



Execute a console command on the server.



\*\*Parameters:\*\*

\- `server\_id` (str) — Server UUID

\- `command` (str) — Console command (no `/`)



\*\*Examples:\*\*

```python

send\_command(ctx\['server\_id'], "say Hello!")

send\_command(server\_id, "give @a apple 1")

send\_command(server\_id, f"kick {player\_name} Goodbye!")

```



\---



\### `log(message)`



Write to server console and automation logs.



\*\*Parameters:\*\*

\- `message` (str) — Message to log



\*\*Examples:\*\*

```python

log("Script loaded")

log(f"Player {ctx\['player\_name']} did something")

```



\---



\### `cpu\_usage()`



Get system-wide CPU usage (0-100).



\*\*Returns:\*\* float



\*\*Examples:\*\*

```python

cpu = cpu\_usage()

if cpu > 85:

&#x20;   log(f"High CPU: {cpu}%")

```



\---



\### `global\_ram\_usage()`



Get total system RAM usage (0-100).



\*\*Returns:\*\* float



\*\*Examples:\*\*

```python

ram = global\_ram\_usage()

if ram > 90:

&#x20;   log("Critical RAM!")

```



\---



\### `server\_ram\_usage(server\_id)`



Get RAM for a specific server (0-100).



\*\*Returns:\*\* float



\*\*Examples:\*\*

```python

ram = server\_ram\_usage(ctx\['server\_id'])

log(f"This server: {ram}% RAM")

```



\---



\### `time()`



Get Unix timestamp.



\*\*Returns:\*\* float



\*\*Examples:\*\*

```python

now = time()

elapsed = now - last\_time

```



\---



\### `random()`



Get random float (0.0-1.0).



\*\*Returns:\*\* float



\*\*Examples:\*\*

```python

if random() < 0.3:

&#x20;   send\_command(server\_id, "say Lucky day!")

```



\---



\## Advanced Patterns



\### Pattern 1: Initialization



```python

def run(ctx):

&#x20;   """Called once when script loads"""

&#x20;   log("Script initialized")



@event('player\_join')

def on\_join(ctx):

&#x20;   # Handle events here

&#x20;   pass

```



\### Pattern 2: State Tracking



```python

player\_messages = {}



@event('player\_chat')

def check\_spam(ctx):

&#x20;   player = ctx\['player\_name']

&#x20;   now = time()

&#x20;   

&#x20;   if player not in player\_messages:

&#x20;       player\_messages\[player] = \[]

&#x20;   

&#x20;   player\_messages\[player] = \[t for t in player\_messages\[player] if now - t < 5]

&#x20;   

&#x20;   if len(player\_messages\[player]) >= 5:

&#x20;       send\_command(ctx\['server\_id'], f"kick {player} No spam!")

&#x20;   else:

&#x20;       player\_messages\[player].append(now)

```



\### Pattern 3: Periodic Tasks



```python

last\_broadcast = {}



@event('player\_chat')

def hourly\_broadcast(ctx):

&#x20;   server = ctx\['server\_id']

&#x20;   now = time()

&#x20;   

&#x20;   if server not in last\_broadcast:

&#x20;       last\_broadcast\[server] = 0

&#x20;   

&#x20;   if now - last\_broadcast\[server] > 3600:  # Every hour

&#x20;       send\_command(server, "say Don't forget to vote!")

&#x20;       last\_broadcast\[server] = now

```



\---



\## Limits



| Limit | Value |

|-------|-------|

| Execution timeout | 5 seconds |

| Max concurrent scripts | 5 workers |

| Allowed modules | `minepanel`, `math`, `random`, `time`, `json` |

| Blocked modules | `os`, `sys`, `subprocess`, `requests`, `socket`, `threading`, etc. |



\---



\## Context Object



Every handler receives `ctx` dict with:



\*\*All events:\*\*

\- `event` — Event name

\- `server\_id` — Server UUID

\- `metrics` — Dict with `cpu\_usage`, `global\_ram\_usage`, `server\_ram\_usage`



\*\*Player events (join/leave/chat):\*\*

\- `player\_name` — Username

\- `player\_uuid` — Player UUID

\- `message` — Chat message (player\_chat only)



\*\*Server events (ready/stop):\*\*

\- `server\_name` — Server name

\- `software` — 'paper', 'vanilla', etc.

\- `version` — Version string (ready only)



\---



\## Debugging



Check server console for `\[Automation Error]` entries. Common errors:



```

Forbidden import: os at line 3

Undefined event decorator: 'on\_crash' at line 8

AttributeError: minepanel has no attribute 'restart' at line 12

Script timed out after 5s and was terminated

```



\---



\## Security



Scripts run in a sandbox that blocks:

\- Filesystem access (`open`, `pathlib`, `shutil`)

\- Network access (`socket`, `urllib`, `requests`)

\- Process spawning (`subprocess`, `os.system`, `multiprocessing`)

\- Threading (`threading`, `asyncio`)

\- Introspection (`getattr`, `exec`, `eval`)



Only interaction via `minepanel` API is allowed.

