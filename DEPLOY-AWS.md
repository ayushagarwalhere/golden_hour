# Deploying Golden Hour on AWS

Golden Hour is one container with no database: every case is stored in the visitor's own browser. The simplest AWS setup is **App Runner** running the Docker image. It gives you HTTPS, autoscaling and a public URL with no servers to manage.

> Region: `ap-south-1` (Mumbai) is used below. Swap in your own.

## 1. Push the image to ECR

```bash
REGION=ap-south-1
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REPO=$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/golden-hour

aws ecr create-repository --repository-name golden-hour --region $REGION
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT.dkr.ecr.$REGION.amazonaws.com

# App Runner runs x86: build for linux/amd64 even on an ARM Mac
docker build --platform linux/amd64 -t $REPO:latest .
docker push $REPO:latest
```

## 2. Store the OpenRouter key as a secret

Never put the key in the image, in git or in a chat.

```bash
aws secretsmanager create-secret --region $REGION \
  --name golden-hour/openrouter-api-key \
  --secret-string 'sk-or-...your key...'
```

## 3. Create the App Runner service (console)

**App Runner → Create service**

| Setting | Value |
|---|---|
| Source | Container registry → Amazon ECR → `golden-hour:latest` |
| Deployment | Automatic (redeploys when you push a new `latest`) |
| Port | `3000` |
| CPU / memory | 1 vCPU / 2 GB |
| Health check | HTTP, path `/api/health` |
| Environment variables | `TRACE_BUDGET_SECONDS=90`, `TRUSTED_PROXY_HOPS=1`, `PUBLIC_SITE_URL=https://<your domain>` |
| Secrets | `OPENROUTER_API_KEY` → the Secrets Manager ARN from step 2 |
| Instance role | A role that allows `secretsmanager:GetSecretValue` on that secret |
| Auto scaling | Max instances: 2–3 is plenty to start |

Optional keys, added the same way: `BLOCKSCOUT_API_KEY` (enables Base, Arbitrum and Polygon) and `TRONGRID_API_KEY` (faster Tron tracing).

**Why `TRACE_BUDGET_SECONDS=90`:** App Runner ends any request after 120 seconds. With a 90-second tracing budget, the case finishes and the documents are written well inside that limit. Anything not followed in time is listed in the report for manual follow-up.

## 4. Check it

```bash
curl https://<service-url>/api/health
# {"ok":true,"ai":"openrouter","blockscoutKey":false,"trongridKey":false}
```

Then open `/?demo=1` and watch a real case trace to KuCoin.

## 5. Your own domain

Go to App Runner → your service → **Custom domains** → Link domain, and add the DNS records it shows (Route 53 or your registrar). HTTPS certificates are automatic.

---

## Alternative: ECS Fargate behind a load balancer

Use this if you need longer traces or more control.

- Same image and secret.
- Container port 3000, health check `/api/health`.
- **Set the load balancer idle timeout to 300 seconds.** You can then leave `TRACE_BUDGET_SECONDS` at its default of 150.
- `TRUSTED_PROXY_HOPS=1` (the ALB).

## Good to know

- **Rate limits** are per instance and in memory: 8 cases and 20 wallet look-ups per IP every 10 minutes. With 2–3 instances that's fine. For heavy traffic, move them to Redis (see `src/lib/rateLimit.ts`).
- **Logs:** App Runner sends stdout to CloudWatch. Victims' stories are never logged.
- **Updating:** build, tag `latest`, push. App Runner redeploys automatically.
- **Cost:** for a small service, mostly App Runner's per-hour compute plus OpenRouter usage, roughly one intake and one statement call per case.

---

## Single EC2 server (Docker Compose + automatic HTTPS)

1. Launch Ubuntu 24.04 (t3.small or larger, 20 GB gp3, no extra file systems). Security group: SSH from your IP, HTTP and HTTPS from anywhere. Attach an Elastic IP.
2. Copy your secrets file to the server, never through git:
   ```bash
   scp -i golden-hour.pem .env.production ubuntu@<ip>:~/
   ```
   It needs `OPENROUTER_API_KEY=…` (or `ANTHROPIC_API_KEY`), plus the Twilio keys below if you want the phone line.
3. On the server:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/ayushagarwalhere/golden_hour/hackathon-build/deploy/ec2/setup.sh -o setup.sh
   bash setup.sh            # or: bash setup.sh your-domain.com
   ```
   Without a domain the site is served at `https://<ip-with-dashes>.sslip.io`, with a real certificate.

## The phone line (Twilio)

1. In Twilio, buy a voice-capable number. Local numbers in India need KYC; a US number works for testing.
2. Under **Phone Numbers → your number → Voice → A call comes in**, choose Webhook, `POST`, `https://<your-domain>/voice/incoming`.
3. Add these to `.env.production` and run `bash setup.sh` again:
   ```
   TWILIO_ACCOUNT_SID=AC...
   TWILIO_AUTH_TOKEN=...
   ```
   With the auth token set, the relay rejects any request not signed by Twilio. With both set, callers get a text message with their link.
4. Call the number. Callers from +91 numbers are greeted in Hindi, Spanish-speaking countries in Spanish, everyone else in English. They can switch by just speaking another language.

Health checks: `https://<domain>/api/health` (app) and `https://<domain>/voice/health` (phone relay: shows whether signing and SMS are on).
