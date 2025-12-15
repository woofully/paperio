# Deployment Guide for Paper.io 2 on Fly.io

## Prerequisites
- Fly.io CLI installed (already done)
- Fly.io account (free tier available)

## Step-by-Step Deployment

### 1. Authenticate with Fly.io

```bash
flyctl auth login
```

This will open your browser to log in or sign up for Fly.io.

### 2. Launch the App

```bash
flyctl launch --no-deploy
```

When prompted:
- App name: Press Enter to use `paperio2-game` (or choose your own)
- Region: Select the region closest to your users (default: `sjc` - San Jose)
- Postgres database: Select **No**
- Redis database: Select **No**

This creates the app on Fly.io without deploying it yet.

### 3. Deploy the App

```bash
flyctl deploy
```

This will:
- Build the Docker image
- Upload it to Fly.io
- Deploy your app
- Allocate resources

The first deployment takes 3-5 minutes.

### 4. Open Your App

```bash
flyctl open
```

This opens your deployed app in the browser!

### 5. Monitor Your App

```bash
# View logs
flyctl logs

# Check status
flyctl status

# Monitor resources
flyctl status --all
```

## Important URLs

After deployment, your app will be available at:
- **Production URL**: `https://paperio2-game.fly.dev` (or your custom name)
- **Health Check**: `https://paperio2-game.fly.dev/health`

## Configuration

### Scaling

Adjust resources in `fly.toml`:

```toml
[[vm]]
  memory = "1gb"  # Increase for more players
  cpu_kind = "shared"
  cpus = 1
```

Then redeploy:
```bash
flyctl deploy
```

### Custom Domain

```bash
flyctl certs create yourdomain.com
```

Follow the DNS instructions provided.

### Environment Variables

```bash
flyctl secrets set SECRET_KEY=your_secret_here
```

## Troubleshooting

### View Logs
```bash
flyctl logs --app paperio2-game
```

### SSH into Container
```bash
flyctl ssh console
```

### Restart App
```bash
flyctl apps restart paperio2-game
```

### Check Health
```bash
curl https://paperio2-game.fly.dev/health
```

## Updating the App

After making code changes:

```bash
# 1. Commit changes
git add .
git commit -m "Your changes"
git push

# 2. Deploy update
flyctl deploy
```

## Cost Estimation

Fly.io free tier includes:
- Up to 3 shared-cpu-1x 256mb VMs
- 160GB outbound data transfer

Your configuration uses:
- 1 VM with 1GB RAM (within free tier)
- Auto-sleep when inactive (saves resources)

## Performance Tips

1. **Enable auto-scaling** for high traffic:
   ```toml
   min_machines_running = 1
   max_machines_running = 3
   ```

2. **Monitor connection limits**:
   - Default: 200 concurrent connections
   - Adjust in `fly.toml` if needed

3. **Use regions close to players**:
   ```bash
   flyctl regions list
   flyctl regions add sea lax
   ```

## Support

- Fly.io Docs: https://fly.io/docs/
- Community Forum: https://community.fly.io/

---

**Note**: Remember to update the app name in all commands if you chose a different name during launch.
