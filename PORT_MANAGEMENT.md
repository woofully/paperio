# Port Management Guide

This guide teaches you how to check and kill processes running on specific ports.

## Quick Reference

| Command | Purpose |
|---------|---------|
| `lsof -i :PORT` | Check if a port is in use |
| `lsof -ti :PORT \| xargs kill -9` | Kill process on a port (one-liner) |
| `kill -9 PID` | Kill a specific process by ID |

---

## 1. Check if a Port is in Use

### Basic Command

```bash
lsof -i :PORT_NUMBER
```

### Examples

```bash
# Check if port 3000 is in use
lsof -i :3000

# Check if port 2567 is in use
lsof -i :2567

# Check multiple ports at once
lsof -i :3000 -i :2567
```

### Understanding the Output

When a port is in use, you'll see:

```
COMMAND   PID  USER   FD   TYPE   DEVICE  SIZE/OFF  NODE  NAME
node    41774 louis   18u  IPv6  0x1234...    0t0   TCP   *:3000 (LISTEN)
```

**Important columns:**
- `COMMAND` - The program using the port (e.g., `node`, `python`, `nginx`)
- `PID` - Process ID (you'll need this to kill it)
- `USER` - Who owns the process
- `NAME` - Port information

### When Port is Free

If nothing is running on the port, you'll see no output or an error:
```bash
# No output = port is free
lsof -i :3000
```

---

## 2. Kill a Process on a Port

### Method 1: Two Steps (Safest & Most Control)

**Step 1 - Find the PID:**
```bash
lsof -i :3000
```

Output shows:
```
COMMAND   PID  USER   FD   TYPE   DEVICE  SIZE/OFF  NODE  NAME
node    41774 louis   18u  IPv6  0x1234...    0t0   TCP   *:3000
```

**Step 2 - Kill using the PID:**
```bash
kill -9 41774
```

### Method 2: One-Liner (Fast & Automatic)

Kill the process without manually finding the PID:

```bash
# Kill whatever is on port 3000
lsof -ti :3000 | xargs kill -9

# Kill whatever is on port 2567
lsof -ti :2567 | xargs kill -9

# Kill multiple ports at once
lsof -ti :3000,:2567 | xargs kill -9
```

**How it works:**
- `lsof -ti :3000` → Gets only the PID number (no headers)
- `|` → Pipes the PID to the next command
- `xargs kill -9` → Takes the PID and force-kills it

### Method 3: Graceful vs Force Kill

```bash
# Try graceful shutdown first (SIGTERM)
kill PID

# If that doesn't work, force kill (SIGKILL)
kill -9 PID

# One-liner with graceful kill
lsof -ti :3000 | xargs kill
```

**When to use each:**
- `kill` (no flag) - Lets the process clean up before exiting
- `kill -9` - Immediately terminates (use when normal kill fails)

---

## 3. Command Breakdown

### `lsof` (List Open Files)

| Flag | Purpose | Example |
|------|---------|---------|
| `-i` | Internet connections | `lsof -i` |
| `-i :PORT` | Specific port | `lsof -i :3000` |
| `-t` | Show only PIDs | `lsof -ti :3000` |
| `-P` | Show port numbers (not service names) | `lsof -iP` |

### `kill` Signals

| Signal | Flag | Purpose | When to Use |
|--------|------|---------|-------------|
| SIGTERM | (default) | Graceful shutdown | First attempt |
| SIGKILL | `-9` | Force kill | When SIGTERM fails |
| SIGHUP | `-1` | Reload config | Restart without killing |

---

## 4. Common Scenarios

### Port Stuck After Ctrl+C

Sometimes pressing Ctrl+C doesn't fully stop the server:

```bash
# Check if still running
lsof -i :3000

# Force kill it
lsof -ti :3000 | xargs kill -9
```

### Check All Node.js Processes

```bash
# See all Node processes and their ports
lsof -i -P | grep node

# Or more specific
ps aux | grep node
```

### Check Common Dev Ports

```bash
# Check multiple common development ports
lsof -i :3000 -i :3001 -i :5173 -i :8080 -i :2567
```

### Kill All Node Processes (Nuclear Option)

```bash
# ⚠️ WARNING: This kills ALL Node processes
killall node

# Or more forceful
killall -9 node
```

---

## 5. Create a Shortcut Function

Add this to your `~/.zshrc` or `~/.bashrc`:

```bash
# Open your shell config
nano ~/.zshrc

# Add this function:
killport() {
    if [ -z "$1" ]; then
        echo "Usage: killport PORT_NUMBER"
        echo "Example: killport 3000"
        return 1
    fi
    
    echo "Checking port $1..."
    local pid=$(lsof -ti :$1)
    
    if [ -z "$pid" ]; then
        echo "ℹ️  No process running on port $1"
        return 0
    fi
    
    echo "Found process $pid on port $1"
    kill -9 $pid 2>/dev/null
    
    if [ $? -eq 0 ]; then
        echo "✅ Killed process on port $1"
    else
        echo "❌ Failed to kill process on port $1"
        return 1
    fi
}

# Save the file (Ctrl+X, then Y, then Enter)

# Reload your shell configuration
source ~/.zshrc
```

### Using the Shortcut

```bash
killport 3000
killport 2567
```

---

## 6. Troubleshooting

### "Permission Denied" Error

If you see permission errors:

```bash
# Try with sudo
sudo lsof -ti :3000 | xargs sudo kill -9
```

### Port Still Shows as "In Use"

Sometimes the OS holds the port briefly after killing:

```bash
# Wait 5 seconds and check again
sleep 5 && lsof -i :3000

# Or use a different port temporarily
# Change port in your config
```

### Finding What's Using a Port on Remote Server

```bash
# If SSH'd into a server
netstat -tuln | grep :3000

# Or
ss -tuln | grep :3000
```

---

## 7. macOS Specific Tips

### Using Activity Monitor

1. Open **Activity Monitor** (Cmd+Space, type "Activity Monitor")
2. Search for the port or process name
3. Select and click "X" to quit

### Port Conflicts with System Services

Some ports are reserved by macOS:
- Port 80 (HTTP) - Requires sudo
- Port 443 (HTTPS) - Requires sudo
- Port 5000 - Sometimes used by AirPlay

Use ports above 1024 for development (like 3000, 8080, etc.)

---

## 8. Quick Command Cheatsheet

```bash
# Check port
lsof -i :3000

# Kill port (one-liner)
lsof -ti :3000 | xargs kill -9

# Check if port is free
lsof -i :3000 || echo "Port is free"

# List all listening ports
lsof -nP -iTCP -sTCP:LISTEN

# Find process by PID
ps aux | grep PID

# Kill by process name
pkill -f "node server.js"
```

---

## 9. Best Practices

1. **Always check before killing** - Make sure you're killing the right process
2. **Try graceful shutdown first** - Use `kill` before `kill -9`
3. **Document your ports** - Keep track of what uses which port
4. **Use port management tools** - Consider using `pm2` for Node.js apps
5. **Avoid running multiple dev servers** - Shut down old ones before starting new

---

## Resources

- `man lsof` - Full lsof documentation
- `man kill` - Full kill documentation
- `lsof -h` - Quick help

---

**Pro Tip:** Add the `killport` function to your shell config and never manually find PIDs again!
