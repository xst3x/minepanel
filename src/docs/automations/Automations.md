\# Automations



Write Python scripts that automatically respond to server events and execute commands.



\## Quick Start



```python

from minepanel import send\_command, log



@event('player\_join')

def welcome(ctx):

&#x20;   send\_command(ctx\['server\_id'], f"say Welcome, {ctx\['player\_name']}!")

```



Save and the script runs when events trigger.



\## Events



| Event | When | Context Keys |

|-------|------|--------------|

| `player\_join` | Player joins | `server\_id`, `player\_name`, `player\_uuid` |

| `player\_leave` | Player leaves | `server\_id`, `player\_name`, `player\_uuid` |

| `player\_chat` | Player sends chat | `server\_id`, `player\_name`, `message` |

| `server\_ready` | Server starts | `server\_id`, `server\_name`, `software`, `version` |

| `server\_stop` | Server stops | `server\_id`, `server\_name` |



\## API



```python

from minepanel import send\_command, log, cpu\_usage, global\_ram\_usage, time, random



send\_command(server\_id, "command")  # Execute console command

log("message")                       # Write to console

cpu\_usage()                          # Get CPU % (0-100)

global\_ram\_usage()                  # Get system RAM % (0-100)

time()                              # Unix timestamp

random()                            # Random 0-1

```



\## Rules



\- \*\*Timeout:\*\* 5 seconds max

\- \*\*Imports:\*\* Only `minepanel`, `math`, `random`, `time`, `json`

\- \*\*No access:\*\* `os`, `subprocess`, `requests`, network, filesystem

\- \*\*Syntax:\*\* Valid Python only



\## Example: Anti-Spam



```python

from minepanel import send\_command, log, time



messages = {}



@event('player\_chat')

def check\_spam(ctx):

&#x20;   player = ctx\['player\_name']

&#x20;   now = time()

&#x20;   

&#x20;   if player not in messages:

&#x20;       messages\[player] = \[]

&#x20;   messages\[player] = \[t for t in messages\[player] if now - t < 5]

&#x20;   

&#x20;   if len(messages\[player]) >= 5:

&#x20;       send\_command(ctx\['server\_id'], f"kick {player} No spam!")

&#x20;   else:

&#x20;       messages\[player].append(now)

```



See the developer docs for complete API reference and more examples.

