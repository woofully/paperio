# 🚀 Deployment Guide: Paper.io 2 on Fly.io

Complete step-by-step guide to deploy your Paper.io 2 game to Fly.io with zero-downtime and automatic HTTPS.

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Step-by-Step Deployment](#step-by-step-deployment)
4. [Post-Deployment Verification](#post-deployment-verification)
5. [Monitoring & Logs](#monitoring--logs)
6. [Updating Your App](#updating-your-app)
7. [Troubleshooting](#troubleshooting)
8. [Advanced Configuration](#advanced-configuration)
9. [Cost & Resource Management](#cost--resource-management)

---

## Prerequisites

### 1. Install Fly.io CLI

**macOS/Linux:**
```bash
curl -L https://fly.io/install.sh | sh
```

**Windows (PowerShell):**
```powershell
pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

**Verify installation:**
```bash
flyctl version
# Expected output: flyctl v0.x.xxx ...
```

### 2. Create Fly.io Account

Visit [fly.io/signup](https://fly.io/signup) and create a free account. No credit card required for the free tier!

### 3. Verify Local Build

Before deploying, ensure your app builds correctly locally:

```bash
# Build all packages
npm run build

# Test the server locally
npm run dev:server  # Should start on port 2567
npm run dev:client  # Should start on port 3000
```

Visit `http://localhost:3000` and verify the game works.

---

## Pre-Deployment Checklist

Before deploying, make sure:

- [ ] All code is committed to git
- [ ] Local build completes without errors (`npm run build`)
- [ ] Game works locally (test multiplayer with multiple browser tabs)
- [ ] Environment variables are documented (if any)
- [ ] `.dockerignore` exists (prevents sending unnecessary files)
- [ ] `Dockerfile` and `fly.toml` are present

**Quick verification:**
```bash
git status                    # Should show clean working directory
npm run build                 # Should complete successfully
ls -la Dockerfile fly.toml    # Should exist
```

---

## Step-by-Step Deployment

### Step 1: Authenticate with Fly.io

```bash
flyctl auth login
```

**Expected behavior:**
- Opens browser automatically
- Shows Fly.io login page
- After login, terminal shows: `successfully logged in as you@email.com`

**If browser doesn't open:**
```bash
flyctl auth login --interactive
# Follow the manual instructions
```

---

### Step 2: Create the App (First Time Only)

```bash
flyctl launch --no-deploy
```

**Interactive prompts and answers:**

```
? Choose an app name (leave blank to generate one): paperio2-game
  ✓ App name available

? Choose a region for deployment:
  > sjc (San Jose, California)    # Choose closest to your users
    sea (Seattle, Washington)
    lax (Los Angeles, California)

? Would you like to set up a Postgresql database?
  > No                             # Select No

? Would you like to set up an Upstash Redis database?
  > No                             # Select No

? Would you like to deploy now?
  > No                             # We'll deploy manually
```

**Expected output:**
```
New app created: paperio2-game
Wrote config file fly.toml
```

**What just happened:**
- Created app on Fly.io servers
- Generated `fly.toml` configuration file
- App is created but NOT deployed yet

---

### Step 3: Review Configuration

Open `fly.toml` and verify the configuration:

```toml
app = "paperio2-game"           # Your app name
primary_region = "sjc"          # Your chosen region

[http_service]
  internal_port = 8080          # Server runs on this port
  force_https = true            # Automatic HTTPS redirect

[[vm]]
  memory = "1gb"                # 1GB RAM (free tier)
  cpu_kind = "shared"
  cpus = 1
```

---

### Step 4: Deploy Your App

```bash
flyctl deploy
```

**Expected output (first deployment takes 3-5 minutes):**

```
==> Verifying app config
--> Verified app config
==> Building image
--> Building image with Docker
[+] Building 120.5s (23/23) FINISHED
 => [builder 1/8] FROM docker.io/library/node:18-alpine
 => [builder 2/8] WORKDIR /app
 => [builder 3/8] COPY package*.json ./
 => [builder 4/8] RUN npm install
 => [builder 5/8] COPY packages/common ./packages/common
 => [builder 6/8] RUN npm run build:common
 => [builder 7/8] RUN npm run build:server
 => [builder 8/8] RUN npm run build:client
 => [stage-1 1/5] FROM docker.io/library/node:18-alpine
 => [stage-1 2/5] WORKDIR /app
 => [stage-1 3/5] COPY --from=builder /app/packages/...
 => exporting to image

==> Pushing image to fly
--> Pushing image done
==> Creating release
--> Release v1 created
--> Release v1 is being deployed

==> Monitoring deployment
 1 desired, 1 placed, 1 healthy, 0 unhealthy
--> v1 deployed successfully
```

**If you see this, deployment succeeded!** 🎉

---

### Step 5: Open Your App

```bash
flyctl open
```

**Expected behavior:**
- Opens browser to: `https://paperio2-game.fly.dev`
- You should see your Paper.io 2 game!
- Try playing - invite friends to test multiplayer

---

## Post-Deployment Verification

### 1. Check App Status

```bash
flyctl status
```

**Expected output:**
```
App
  Name     = paperio2-game
  Owner    = your-org
  Hostname = paperio2-game.fly.dev
  Image    = paperio2-game:latest
  Platform = machines

Machines
PROCESS ID              VERSION REGION  STATE   CHECKS  LAST UPDATED
app     3287441e740098  1       sjc     started 1 total 2024-12-17T12:30:00Z
```

**✓ Good signs:**
- STATE = `started` or `running`
- CHECKS = green checkmark

**❌ Bad signs:**
- STATE = `failed`, `stopped`
- CHECKS = red X

---

### 2. Test Health Endpoint

```bash
curl https://paperio2-game.fly.dev/health
```

**Expected output:**
```json
{"status":"ok"}
```

---

### 3. Watch Real-Time Logs

```bash
flyctl logs
```

**Expected output:**
```
2024-12-17T12:30:15Z app[3287441e740098] sjc [info] 🎮 Paper.io 2 Server listening on port 8080
2024-12-17T12:30:20Z app[3287441e740098] sjc [info] GameRoom created (max 10 players)
```

**Look for:**
- Server startup message
- No error messages
- GameRoom creation logs

---

### 4. Test Multiplayer

1. Open app in browser: `https://paperio2-game.fly.dev`
2. Start playing
3. Open app in **another browser/device**
4. Both players should see each other

**Check logs for player joins:**
```bash
flyctl logs | grep "Player.*joined"
```

---

## Monitoring & Logs

### View Live Logs

```bash
# Real-time streaming logs
flyctl logs

# Last 100 lines
flyctl logs --count 100

# Filter by text
flyctl logs | grep "Player.*died"
flyctl logs | grep "ERROR"
```

### Check Resource Usage

```bash
flyctl status --all
```

Shows:
- CPU usage
- Memory usage
- Network traffic
- Active connections

### Monitor Uptime

```bash
flyctl checks list
```

Shows health check status and history.

---

## Updating Your App

After making code changes:

### Option 1: Quick Deploy (Recommended)

```bash
# 1. Build locally to verify (optional)
npm run build

# 2. Deploy to Fly.io
flyctl deploy

# 3. Watch logs for issues
flyctl logs
```

### Option 2: With Git Workflow

```bash
# 1. Commit changes
git add .
git commit -m "Add new feature: XYZ"
git push

# 2. Deploy to Fly.io
flyctl deploy

# 3. Tag release (optional)
git tag v1.0.1
git push --tags
```

### Rolling Back

If the new deployment has issues:

```bash
# View release history
flyctl releases

# Rollback to previous version
flyctl releases rollback
```

---

## Troubleshooting

### Issue 1: Deployment Fails During Build

**Symptoms:**
```
Error: failed to fetch an image or build from source
```

**Solutions:**

1. **Check Dockerfile syntax:**
   ```bash
   docker build -t test .
   ```

2. **Verify all files exist:**
   ```bash
   ls -la packages/common packages/server packages/client
   ```

3. **Clear build cache:**
   ```bash
   flyctl deploy --no-cache
   ```

---

### Issue 2: App Crashes After Deploy

**Symptoms:**
```
STATE = failed
Machines are crashing
```

**Debug steps:**

1. **Check logs for errors:**
   ```bash
   flyctl logs | grep -i error
   ```

2. **Common errors and fixes:**

   **Error:** `Cannot find module '@paperio2/common'`
   **Fix:** Rebuild packages in correct order:
   ```bash
   npm run build:common
   npm run build:server
   flyctl deploy
   ```

   **Error:** `EADDRINUSE: Port 2567 already in use`
   **Fix:** Change server to use Fly.io's PORT:
   ```javascript
   const port = process.env.PORT || 2567;
   ```

3. **SSH into container for debugging:**
   ```bash
   flyctl ssh console
   node --version
   ls -la packages/server/dist
   ```

---

### Issue 3: WebSocket Connections Fail

**Symptoms:**
- Game loads but players can't connect
- Console error: `WebSocket connection failed`

**Solutions:**

1. **Verify WebSocket support in fly.toml:**
   ```toml
   [http_service]
     internal_port = 8080
     force_https = true
     # WebSockets work automatically with Fly.io
   ```

2. **Check client connection URL:**

   In production, client should auto-detect:
   ```typescript
   const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
   const host = window.location.host; // Uses same domain
   const client = new Colyseus.Client(`${protocol}//${host}`);
   ```

3. **Test WebSocket connection:**
   ```bash
   # Install wscat if not available
   npm install -g wscat

   # Test connection
   wscat -c wss://paperio2-game.fly.dev
   ```

---

### Issue 4: High Memory Usage / Crashes

**Symptoms:**
```
Out of memory
Killed
```

**Solutions:**

1. **Check current memory usage:**
   ```bash
   flyctl status --all
   ```

2. **Increase memory in fly.toml:**
   ```toml
   [[vm]]
     memory = "2gb"  # Increased from 1gb
     cpu_kind = "shared"
     cpus = 1
   ```

3. **Redeploy:**
   ```bash
   flyctl deploy
   ```

4. **Monitor memory after change:**
   ```bash
   flyctl status --all
   # Watch the MEMORY column
   ```

---

### Issue 5: Slow Performance / Lag

**Causes & Solutions:**

1. **Wrong region:**
   ```bash
   # Check current regions
   flyctl regions list

   # Add regions closer to users
   flyctl regions add sea lax ord  # US regions
   flyctl regions add ams lhr      # Europe regions
   flyctl regions add nrt syd      # Asia/Pacific
   ```

2. **Not enough resources:**
   - Upgrade to 2GB memory (see Issue 4)
   - Enable auto-scaling (see Advanced Configuration)

3. **Too many connections:**
   - Check connection limits in fly.toml
   - Consider multiple instances

---

### Issue 6: Domain/HTTPS Issues

**Symptoms:**
- "Not Secure" warning
- SSL errors

**Solutions:**

1. **Verify HTTPS is enabled:**
   ```bash
   flyctl apps show paperio2-game
   # Look for "Hostname" with https://
   ```

2. **Check force_https in fly.toml:**
   ```toml
   [http_service]
     force_https = true  # Must be true
   ```

3. **For custom domains:**
   ```bash
   flyctl certs create yourdomain.com
   flyctl certs show yourdomain.com
   # Follow DNS instructions
   ```

---

## Advanced Configuration

### Auto-Scaling

Enable automatic scaling based on traffic:

**fly.toml:**
```toml
[http_service]
  auto_stop_machines = true   # Stop when idle
  auto_start_machines = true  # Start on demand
  min_machines_running = 1    # Always keep 1 running
  max_machines_running = 3    # Scale up to 3

  [http_service.concurrency]
    type = "connections"
    soft_limit = 200     # Warn at 200 connections
    hard_limit = 250     # Max 250 connections per instance
```

**Deploy changes:**
```bash
flyctl deploy
```

---

### Multiple Regions

Deploy to multiple regions for global low-latency:

```bash
# Add regions
flyctl regions add sea lax ord ams lhr

# Verify
flyctl regions list

# Deploy
flyctl deploy
```

**How it works:**
- Users connect to nearest region automatically
- Lower latency worldwide
- Higher availability

---

### Environment Variables

Set secrets for production:

```bash
# Set a secret
flyctl secrets set SECRET_KEY=your-secret-value

# List secrets (values hidden)
flyctl secrets list

# Remove a secret
flyctl secrets unset SECRET_KEY
```

**Access in code:**
```javascript
const secretKey = process.env.SECRET_KEY;
```

---

### Custom Domain

Use your own domain instead of `.fly.dev`:

**1. Add SSL certificate:**
```bash
flyctl certs create yourdomain.com
```

**2. Configure DNS:**

Add these records to your DNS provider:

```
Type: A
Name: @
Value: [IP shown by Fly.io]

Type: AAAA
Name: @
Value: [IPv6 shown by Fly.io]
```

**3. Verify:**
```bash
flyctl certs show yourdomain.com
# Wait for "Status: Ready"
```

**4. Test:**
```bash
curl https://yourdomain.com/health
```

---

### Persistent Storage (Optional)

If you need to store data persistently:

```bash
# Create volume (10GB)
flyctl volumes create game_data --size 10 --region sjc

# Update fly.toml
```

Add to fly.toml:
```toml
[mounts]
  source = "game_data"
  destination = "/data"
```

**Use in code:**
```javascript
const dataPath = '/data/scores.json';
fs.writeFileSync(dataPath, JSON.stringify(scores));
```

---

## Cost & Resource Management

### Free Tier Limits (as of 2024)

Fly.io free tier includes:
- ✅ Up to 3 shared-cpu VMs (256MB each) OR
- ✅ 1 VM with 1GB RAM (what we're using)
- ✅ 160GB outbound bandwidth/month
- ✅ Automatic HTTPS
- ✅ All regions available

### Your Current Configuration

```toml
[[vm]]
  memory = "1gb"        # Uses free tier allowance
  cpu_kind = "shared"   # Free tier
  cpus = 1              # Free tier
```

**Estimated costs:**
- **Free tier:** $0/month (within limits)
- **If scaling to 2 VMs:** ~$2-5/month
- **With 2GB RAM:** ~$5-10/month

### Monitor Usage

```bash
# Check current usage
flyctl status --all

# View bandwidth usage
flyctl dashboard
# Opens browser to usage dashboard
```

### Optimize Costs

1. **Enable auto-stop for low traffic:**
   ```toml
   auto_stop_machines = true
   ```

2. **Use minimum necessary resources:**
   - Start with 1GB RAM
   - Only increase if needed

3. **Monitor logs for waste:**
   ```bash
   flyctl logs | grep -i "memory\|cpu"
   ```

---

## Useful Commands Reference

```bash
# Deployment
flyctl deploy                    # Deploy latest code
flyctl deploy --no-cache         # Deploy with clean build
flyctl deploy --remote-only      # Build on Fly.io servers

# Monitoring
flyctl logs                      # Stream logs
flyctl logs -f                   # Follow logs (continuous)
flyctl status                    # App status
flyctl checks list               # Health checks

# Management
flyctl apps restart              # Restart app
flyctl apps destroy              # Delete app (careful!)
flyctl ssh console               # SSH into container
flyctl proxy 2567:8080           # Forward port to local

# Scaling
flyctl scale count 2             # Run 2 instances
flyctl scale memory 2gb          # Change memory
flyctl regions add sea lax       # Add regions

# Information
flyctl info                      # App information
flyctl releases                  # Deployment history
flyctl dashboard                 # Open web dashboard
```

---

## Support & Resources

### Documentation
- 📚 Fly.io Docs: https://fly.io/docs/
- 🎮 Colyseus Docs: https://docs.colyseus.io/
- 💬 Fly.io Community: https://community.fly.io/

### Getting Help

1. **Check logs first:**
   ```bash
   flyctl logs | grep -i error
   ```

2. **Fly.io Community Forum:**
   - Post at: https://community.fly.io/
   - Include: app name, logs, fly.toml

3. **GitHub Issues:**
   - For game-specific bugs
   - Include: reproduction steps, logs

---

## Quick Start Summary

**For first-time deployment:**

```bash
# 1. Authenticate
flyctl auth login

# 2. Create app
flyctl launch --no-deploy

# 3. Deploy
flyctl deploy

# 4. Open and play!
flyctl open
```

**For updates:**

```bash
flyctl deploy
```

**For debugging:**

```bash
flyctl logs
flyctl status
```

---

## Checklist: Successful Deployment

After deployment, verify these:

- [ ] App status shows `started` or `running`
- [ ] Health endpoint returns `{"status":"ok"}`
- [ ] Game loads in browser at `https://your-app.fly.dev`
- [ ] Can create username and join game
- [ ] Multiplayer works (test with 2+ browser tabs)
- [ ] No errors in logs (`flyctl logs`)
- [ ] Players can capture territory
- [ ] Death animations show explosions 💥
- [ ] Leaderboard updates correctly

---

## What's Next?

After successful deployment:

1. **Share your game!** Send the URL to friends
2. **Monitor performance** with `flyctl status`
3. **Add features** and redeploy with `flyctl deploy`
4. **Scale up** if needed (more regions, memory)
5. **Set up custom domain** (optional)

---

**🎉 Congratulations!** Your Paper.io 2 game is now live on Fly.io!

Need help? Check the [Troubleshooting](#troubleshooting) section or open an issue.

---

*Last updated: December 2024*
*Fly.io platform version: v2*
