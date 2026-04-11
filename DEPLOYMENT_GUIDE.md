# EvidentIS: Evidence-Based Intelligent Decision System - Cloud Deployment Guide

## Complete Step-by-Step Guide to Deploy EvidentIS on Cloud Infrastructure

This guide covers deployment to **AWS**, **Google Cloud Platform (GCP)**, and **Azure**. Choose your preferred cloud provider and follow the corresponding sections.

**EvidentIS** stands for **Evidence-Based Intelligent Decision System**.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Architecture Overview](#architecture-overview)
3. [AWS Deployment](#aws-deployment)
4. [GCP Deployment](#gcp-deployment)
5. [Azure Deployment](#azure-deployment)
6. [Kubernetes Deployment (Any Cloud)](#kubernetes-deployment)
7. [Database Setup](#database-setup)
8. [SSL/TLS Configuration](#ssltls-configuration)
9. [DNS Configuration](#dns-configuration)
10. [Monitoring Setup](#monitoring-setup)
11. [Backup Strategy](#backup-strategy)
12. [Security Hardening](#security-hardening)
13. [Authentication Configuration](#authentication-configuration)
14. [CI/CD Pipeline](#cicd-pipeline)
15. [Troubleshooting](#troubleshooting)
16. [Post-Deployment Checklist](#post-deployment-checklist)
17. [Support](#support)

---

## Prerequisites

### Required Tools

```bash
# Install required CLI tools

# AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip && sudo ./aws/install

# Google Cloud CLI
curl https://sdk.cloud.google.com | bash

# Azure CLI
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# Kubernetes CLI
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

# Helm
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Docker
curl -fsSL https://get.docker.com | sh

# Terraform (optional, for IaC)
wget https://releases.hashicorp.com/terraform/1.7.0/terraform_1.7.0_linux_amd64.zip
unzip terraform_1.7.0_linux_amd64.zip && sudo mv terraform /usr/local/bin/
```

### Required Accounts & Access

- [ ] Cloud provider account (AWS/GCP/Azure)
- [ ] Domain name for your deployment
- [ ] Paddle account for billing
- [ ] Email provider (SendGrid/AWS SES) for notifications
- [ ] Container registry access (Docker Hub/ECR/GCR/ACR)

### Environment Variables Template

Create a `.env.production` file:

```bash
# =============================================================================
# CORE CONFIGURATION
# =============================================================================
NODE_ENV=production
PORT=4000
API_URL=https://api.yourdomain.com
FRONTEND_URL=https://app.yourdomain.com

# =============================================================================
# DATABASE
# =============================================================================
DATABASE_URL=postgresql://evidentis:SECURE_PASSWORD@db.yourdomain.com:5432/evidentis_production?sslmode=require

# =============================================================================
# REDIS
# =============================================================================
REDIS_URL=rediss://default:SECURE_PASSWORD@redis.yourdomain.com:6379

# =============================================================================
# AUTHENTICATION
# =============================================================================
# Generate with: openssl genrsa -out private.pem 2048 && openssl rsa -in private.pem -pubout -out public.pem
JWT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# =============================================================================
# ENCRYPTION
# =============================================================================
# Generate with: openssl rand -hex 32
APP_ENCRYPTION_KEY=your-64-character-hex-key-here

# =============================================================================
# STORAGE (S3-compatible)
# =============================================================================
S3_BUCKET=evidentis-documents-production
S3_REGION=us-east-1
S3_ENDPOINT=https://s3.amazonaws.com
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...

# =============================================================================
# AI SERVICE
# =============================================================================
AI_SERVICE_URL=http://ai-service:5000
OLLAMA_BASE_URL=http://ollama:11434
AI_SERVICE_TIMEOUT_MS=60000

# =============================================================================
# MALWARE SCANNING
# =============================================================================
MALWARE_SCANNER=clamav
CLAMAV_HOST=clamav
CLAMAV_PORT=3310

# =============================================================================
# PADDLE BILLING
# =============================================================================
PADDLE_VENDOR_ID=...
PADDLE_API_KEY=pdl_live_...
PADDLE_WEBHOOK_SECRET=pdl_ntfset_...
PADDLE_PRICE_STARTER=pri_...
PADDLE_PRICE_GROWTH=pri_...
PADDLE_PRICE_PROFESSIONAL=pri_...

# =============================================================================
# EMAIL
# =============================================================================
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=SG...
EMAIL_FROM=noreply@yourdomain.com

# =============================================================================
# OBSERVABILITY
# =============================================================================
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-collector.yourdomain.com:4318
OTEL_SERVICE_NAME=evidentis-api
LOG_LEVEL=info
```

---

## Architecture Overview

### Production Architecture

```
                                    ┌─────────────────┐
                                    │   CloudFlare    │
                                    │   (CDN + WAF)   │
                                    └────────┬────────┘
                                             │
                                    ┌────────┴────────┐
                                    │  Load Balancer  │
                                    │  (ALB/NLB/GLB)  │
                                    └────────┬────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
           ┌────────┴────────┐     ┌────────┴────────┐     ┌────────┴────────┐
           │   Web Frontend  │     │    API Server   │     │   AI Service    │
           │   (3 replicas)  │     │   (3 replicas)  │     │  (2 replicas)   │
           │   Next.js SSR   │     │    Fastify      │     │   FastAPI       │
           └─────────────────┘     └────────┬────────┘     └────────┬────────┘
                                            │                       │
                    ┌───────────────────────┼───────────────────────┤
                    │                       │                       │
           ┌────────┴────────┐    ┌────────┴────────┐    ┌────────┴────────┐
           │  PostgreSQL     │    │     Redis       │    │    Ollama       │
           │  (Primary +     │    │   (Cluster)     │    │   (GPU Node)    │
           │   Read Replica) │    │                 │    │                 │
           └─────────────────┘    └─────────────────┘    └─────────────────┘
                    │
           ┌────────┴────────┐
           │   S3 / Blob     │
           │   Storage       │
           └─────────────────┘
```

### Resource Requirements

| Component | CPU | Memory | Storage | Replicas |
|-----------|-----|--------|---------|----------|
| Web Frontend | 0.5 vCPU | 1 GB | - | 3 |
| API Server | 1 vCPU | 2 GB | - | 3 |
| AI Service | 2 vCPU | 8 GB | - | 2 |
| PostgreSQL | 2 vCPU | 8 GB | 100 GB SSD | 1+1 replica |
| Redis | 1 vCPU | 4 GB | 20 GB | 3 (cluster) |
| Ollama (GPU) | 4 vCPU | 16 GB | 50 GB | 1-2 |

**Estimated Monthly Cost**: $800-1,500 (varies by cloud provider and usage)

---

## AWS Deployment

### Step 1: Set Up AWS Infrastructure

```bash
# Configure AWS CLI
aws configure
# Enter: Access Key ID, Secret Access Key, Region (us-east-1), Output format (json)

# Create VPC
aws ec2 create-vpc --cidr-block 10.0.0.0/16 --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=evidentis-vpc}]'

# Note the VPC ID from output (vpc-xxxxxxxx)
export VPC_ID=vpc-xxxxxxxx

# Create subnets (2 public, 2 private across 2 AZs)
aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.1.0/24 --availability-zone us-east-1a --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=evidentis-public-1a}]'
aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.2.0/24 --availability-zone us-east-1b --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=evidentis-public-1b}]'
aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.3.0/24 --availability-zone us-east-1a --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=evidentis-private-1a}]'
aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.4.0/24 --availability-zone us-east-1b --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=evidentis-private-1b}]'
```

### Step 2: Set Up RDS PostgreSQL

```bash
# Create DB subnet group
aws rds create-db-subnet-group \
  --db-subnet-group-name evidentis-db-subnet \
  --db-subnet-group-description "EvidentIS DB Subnet Group" \
  --subnet-ids subnet-private-1a subnet-private-1b

# Create PostgreSQL instance with pgvector
aws rds create-db-instance \
  --db-instance-identifier evidentis-production \
  --db-instance-class db.r6g.large \
  --engine postgres \
  --engine-version 16.1 \
  --master-username evidentis_admin \
  --master-user-password "YOUR_SECURE_PASSWORD" \
  --allocated-storage 100 \
  --storage-type gp3 \
  --storage-encrypted \
  --vpc-security-group-ids sg-xxxxxxxx \
  --db-subnet-group-name evidentis-db-subnet \
  --backup-retention-period 30 \
  --multi-az \
  --auto-minor-version-upgrade \
  --deletion-protection

# Wait for instance to be available (5-10 minutes)
aws rds wait db-instance-available --db-instance-identifier evidentis-production

# Install pgvector extension (connect to DB and run)
psql -h evidentis-production.xxxxxxxx.us-east-1.rds.amazonaws.com -U evidentis_admin -d postgres
CREATE EXTENSION vector;
```

### Step 3: Set Up ElastiCache Redis

```bash
# Create Redis cluster
aws elasticache create-replication-group \
  --replication-group-id evidentis-redis \
  --replication-group-description "EvidentIS Redis Cluster" \
  --engine redis \
  --engine-version 7.0 \
  --cache-node-type cache.r6g.large \
  --num-cache-clusters 3 \
  --automatic-failover-enabled \
  --at-rest-encryption-enabled \
  --transit-encryption-enabled \
  --auth-token "YOUR_REDIS_AUTH_TOKEN" \
  --cache-subnet-group-name evidentis-redis-subnet \
  --security-group-ids sg-xxxxxxxx
```

### Step 4: Set Up S3 for Document Storage

```bash
# Create S3 bucket
aws s3api create-bucket \
  --bucket evidentis-documents-production \
  --region us-east-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket evidentis-documents-production \
  --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket evidentis-documents-production \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "aws:kms",
        "KMSMasterKeyID": "alias/evidentis-key"
      }
    }]
  }'

# Block public access
aws s3api put-public-access-block \
  --bucket evidentis-documents-production \
  --public-access-block-configuration '{
    "BlockPublicAcls": true,
    "IgnorePublicAcls": true,
    "BlockPublicPolicy": true,
    "RestrictPublicBuckets": true
  }'

# Create quarantine bucket for malware scanning
aws s3api create-bucket --bucket evidentis-quarantine-production --region us-east-1
```

### Step 5: Set Up Secrets Manager

```bash
# Store database credentials
aws secretsmanager create-secret \
  --name evidentis/production/database \
  --secret-string '{
    "url": "postgresql://evidentis_admin:PASSWORD@evidentis-production.xxx.rds.amazonaws.com:5432/evidentis",
    "host": "evidentis-production.xxx.rds.amazonaws.com",
    "username": "evidentis_admin",
    "password": "YOUR_PASSWORD"
  }'

# Store JWT keys
aws secretsmanager create-secret \
  --name evidentis/production/jwt \
  --secret-string '{
    "private_key": "-----BEGIN RSA PRIVATE KEY-----\n...",
    "public_key": "-----BEGIN PUBLIC KEY-----\n..."
  }'

# Store encryption key
aws secretsmanager create-secret \
  --name evidentis/production/encryption \
  --secret-string '{"key": "your-64-char-hex-key"}'

# Store Paddle keys
aws secretsmanager create-secret \
  --name evidentis/production/paddle \
  --secret-string '{
    "vendor_id": "your-vendor-id",
    "api_key": "pdl_live_...",
    "webhook_secret": "pdl_ntfset_...",
    "price_starter": "pri_...",
    "price_growth": "pri_...",
    "price_professional": "pri_..."
  }'
```

### Step 6: Set Up EKS Cluster

```bash
# Create EKS cluster
eksctl create cluster \
  --name evidentis-production \
  --region us-east-1 \
  --version 1.29 \
  --vpc-private-subnets subnet-private-1a,subnet-private-1b \
  --vpc-public-subnets subnet-public-1a,subnet-public-1b \
  --nodegroup-name evidentis-workers \
  --node-type t3.large \
  --nodes 3 \
  --nodes-min 2 \
  --nodes-max 10 \
  --managed \
  --asg-access \
  --external-dns-access \
  --full-ecr-access \
  --alb-ingress-access

# Update kubeconfig
aws eks update-kubeconfig --name evidentis-production --region us-east-1

# Install AWS Load Balancer Controller
helm repo add eks https://aws.github.io/eks-charts
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=evidentis-production \
  --set serviceAccount.create=true \
  --set region=us-east-1

# Install External Secrets Operator (for AWS Secrets Manager)
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets \
  -n external-secrets --create-namespace
```

### Step 7: Build and Push Docker Images

```bash
# Create ECR repositories
aws ecr create-repository --repository-name evidentis/api
aws ecr create-repository --repository-name evidentis/web
aws ecr create-repository --repository-name evidentis/ai-service

# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com

# Build and push images
cd evidentis

# API
docker build -f apps/api/Dockerfile.api -t evidentis/api:latest .
docker tag evidentis/api:latest 123456789012.dkr.ecr.us-east-1.amazonaws.com/evidentis/api:latest
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/evidentis/api:latest

# Web
docker build -f apps/web/Dockerfile.web -t evidentis/web:latest .
docker tag evidentis/web:latest 123456789012.dkr.ecr.us-east-1.amazonaws.com/evidentis/web:latest
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/evidentis/web:latest

# AI Service
docker build -f apps/ai-service/Dockerfile -t evidentis/ai-service:latest apps/ai-service/
docker tag evidentis/ai-service:latest 123456789012.dkr.ecr.us-east-1.amazonaws.com/evidentis/ai-service:latest
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/evidentis/ai-service:latest
```

### Step 8: Deploy to Kubernetes

```bash
# Apply namespace and secrets
kubectl apply -f k8s/deployment.yaml

# Verify deployments
kubectl get pods -n evidentis
kubectl get services -n evidentis
kubectl get ingress -n evidentis

# Check logs
kubectl logs -f deployment/api -n evidentis
```

### Step 9: Run Database Migrations

```bash
# Create a migration job
kubectl run evidentis-migrate --rm -it --restart=Never \
  --image=123456789012.dkr.ecr.us-east-1.amazonaws.com/evidentis/api:latest \
  --env="DATABASE_URL=postgresql://..." \
  -n evidentis \
  -- npm run migrate:up
```

### Step 10: Configure DNS and SSL

```bash
# Get Load Balancer address
kubectl get ingress -n evidentis

# Create Route 53 records (A records pointing to ALB)
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890 \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "api.yourdomain.com",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "Z35SXDOTRQ7X7K",
          "DNSName": "k8s-evidentis-xxx.us-east-1.elb.amazonaws.com",
          "EvaluateTargetHealth": true
        }
      }
    }]
  }'

# SSL is handled automatically by AWS ACM + ALB
# Request certificate
aws acm request-certificate \
  --domain-name "*.yourdomain.com" \
  --validation-method DNS
```

---

## GCP Deployment

### Step 1: Set Up GCP Infrastructure

```bash
# Set project
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable \
  container.googleapis.com \
  sqladmin.googleapis.com \
  redis.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com

# Create VPC
gcloud compute networks create evidentis-vpc --subnet-mode=custom

# Create subnets
gcloud compute networks subnets create evidentis-subnet \
  --network=evidentis-vpc \
  --region=us-central1 \
  --range=10.0.0.0/16
```

### Step 2: Set Up Cloud SQL PostgreSQL

```bash
# Create PostgreSQL instance
gcloud sql instances create evidentis-production \
  --database-version=POSTGRES_16 \
  --tier=db-custom-2-8192 \
  --region=us-central1 \
  --storage-size=100GB \
  --storage-type=SSD \
  --storage-auto-increase \
  --backup-start-time=03:00 \
  --enable-point-in-time-recovery \
  --availability-type=REGIONAL \
  --database-flags=max_connections=500

# Set root password
gcloud sql users set-password postgres \
  --instance=evidentis-production \
  --password=YOUR_SECURE_PASSWORD

# Create database
gcloud sql databases create evidentis --instance=evidentis-production

# Enable pgvector (run SQL in Cloud SQL)
# CREATE EXTENSION vector;
```

### Step 3: Set Up Memorystore Redis

```bash
# Create Redis instance
gcloud redis instances create evidentis-redis \
  --size=4 \
  --region=us-central1 \
  --redis-version=redis_7_0 \
  --tier=STANDARD_HA \
  --transit-encryption-mode=SERVER_AUTHENTICATION
```

### Step 4: Set Up GKE Cluster

```bash
# Create GKE cluster
gcloud container clusters create evidentis-production \
  --region=us-central1 \
  --num-nodes=3 \
  --machine-type=e2-standard-4 \
  --enable-autoscaling \
  --min-nodes=2 \
  --max-nodes=10 \
  --enable-network-policy \
  --workload-pool=YOUR_PROJECT_ID.svc.id.goog

# Get credentials
gcloud container clusters get-credentials evidentis-production --region=us-central1
```

### Step 5: Deploy to GKE

```bash
# Build and push to GCR
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/evidentis-api:latest apps/api/
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/evidentis-web:latest apps/web/
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/evidentis-ai-service:latest apps/ai-service/

# Apply Kubernetes manifests
kubectl apply -f k8s/deployment.yaml
```

---

## Azure Deployment

### Step 1: Set Up Azure Infrastructure

```bash
# Login to Azure
az login

# Create resource group
az group create --name evidentis-production --location eastus

# Create VNet
az network vnet create \
  --resource-group evidentis-production \
  --name evidentis-vnet \
  --address-prefix 10.0.0.0/16 \
  --subnet-name default \
  --subnet-prefix 10.0.0.0/24
```

### Step 2: Set Up Azure Database for PostgreSQL

```bash
# Create PostgreSQL Flexible Server
az postgres flexible-server create \
  --resource-group evidentis-production \
  --name evidentis-db \
  --location eastus \
  --admin-user evidentis_admin \
  --admin-password YOUR_SECURE_PASSWORD \
  --sku-name Standard_D2s_v3 \
  --storage-size 128 \
  --version 16 \
  --high-availability Enabled

# Configure pgvector extension
az postgres flexible-server parameter set \
  --resource-group evidentis-production \
  --server-name evidentis-db \
  --name azure.extensions \
  --value vector
```

### Step 3: Set Up Azure Cache for Redis

```bash
# Create Redis cache
az redis create \
  --resource-group evidentis-production \
  --name evidentis-redis \
  --location eastus \
  --sku Premium \
  --vm-size P1 \
  --enable-non-ssl-port false \
  --minimum-tls-version 1.2
```

### Step 4: Set Up AKS Cluster

```bash
# Create AKS cluster
az aks create \
  --resource-group evidentis-production \
  --name evidentis-aks \
  --node-count 3 \
  --node-vm-size Standard_D4s_v3 \
  --enable-managed-identity \
  --enable-addons monitoring \
  --generate-ssh-keys

# Get credentials
az aks get-credentials --resource-group evidentis-production --name evidentis-aks
```

### Step 5: Deploy to AKS

```bash
# Build and push to ACR
az acr create --resource-group evidentis-production --name evidentisacr --sku Premium
az acr login --name evidentisacr

docker tag evidentis/api:latest evidentisacr.azurecr.io/evidentis/api:latest
docker push evidentisacr.azurecr.io/evidentis/api:latest

# Attach ACR to AKS
az aks update --resource-group evidentis-production --name evidentis-aks --attach-acr evidentisacr

# Deploy
kubectl apply -f k8s/deployment.yaml
```

---

## Kubernetes Deployment

### Apply the Full Deployment

The `k8s/deployment.yaml` file contains everything needed:

```bash
# Create namespace
kubectl create namespace evidentis

# Apply external secrets (AWS Secrets Manager / GCP Secret Manager / Azure Key Vault)
kubectl apply -f k8s/external-secrets.yaml

# Apply all resources
kubectl apply -f k8s/deployment.yaml

# Verify deployment
kubectl get all -n evidentis
```

### Scaling Configuration

```bash
# Manual scaling
kubectl scale deployment api --replicas=5 -n evidentis
kubectl scale deployment worker --replicas=4 -n evidentis

# View HPA status (API only)
kubectl get hpa -n evidentis

# Update API HPA limits
kubectl patch hpa api-hpa -n evidentis --type='json' -p='[{"op": "replace", "path": "/spec/maxReplicas", "value": 30}]'
```

### Rolling Updates

```bash
# Update image
kubectl set image deployment/api api=evidentis/api:v1.2.0 -n evidentis

# Check rollout status
kubectl rollout status deployment/api -n evidentis

# Rollback if needed
kubectl rollout undo deployment/api -n evidentis
```

---

## Database Setup

### Run Migrations

```bash
# Option 1: Kubernetes Job
kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: evidentis-migrate
  namespace: evidentis
spec:
  template:
    spec:
      containers:
      - name: migrate
        image: evidentis/api:latest
        command: ["npm", "run", "migrate:up"]
        envFrom:
        - secretRef:
            name: evidentis-secrets
      restartPolicy: Never
  backoffLimit: 3
EOF

# Option 2: Direct connection
kubectl run -it --rm migration \
  --image=evidentis/api:latest \
  --restart=Never \
  -n evidentis \
  -- npm run migrate:up
```

### Seed Data (Optional)

```bash
kubectl run -it --rm seeder \
  --image=evidentis/api:latest \
  --restart=Never \
  -n evidentis \
  -- npm run seed
```

---

## SSL/TLS Configuration

### Using cert-manager (Recommended)

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Create ClusterIssuer for Let's Encrypt
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@yourdomain.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

### Using Cloud Provider Certificates

**AWS ACM:**
```bash
# Request certificate
aws acm request-certificate \
  --domain-name "*.yourdomain.com" \
  --validation-method DNS

# Add to Ingress annotation
# alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:...
```

**GCP Managed Certificates:**
```yaml
apiVersion: networking.gke.io/v1
kind: ManagedCertificate
metadata:
  name: evidentis-cert
spec:
  domains:
    - api.yourdomain.com
    - app.yourdomain.com
```

---

## DNS Configuration

### CloudFlare (Recommended)

```bash
# Add DNS records
# Type: A, Name: api, Content: <Load Balancer IP>
# Type: A, Name: app, Content: <Load Balancer IP>
# Type: CNAME, Name: www, Content: app.yourdomain.com

# Enable Full SSL mode
# Enable Always Use HTTPS
# Enable Auto Minify
# Configure Page Rules for caching
```

### Route 53 (AWS)

```bash
# Create hosted zone if not exists
aws route53 create-hosted-zone --name yourdomain.com --caller-reference $(date +%s)

# Add A records (alias to ALB)
# See Step 10 in AWS deployment section
```

---

## Monitoring Setup

### Prometheus + Grafana

```bash
# Install Prometheus stack
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set grafana.adminPassword=SECURE_PASSWORD

# Access Grafana
kubectl port-forward svc/prometheus-grafana 3000:80 -n monitoring
# Open http://localhost:3000 (admin / SECURE_PASSWORD)
```

### Import EvidentIS Dashboard

```json
{
  "dashboard": {
    "title": "EvidentIS Production",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [{"expr": "rate(http_requests_total[5m])"}]
      },
      {
        "title": "Error Rate",
        "type": "graph",
        "targets": [{"expr": "rate(http_requests_total{status=~\"5..\"}[5m])"}]
      },
      {
        "title": "Response Time",
        "type": "graph",
        "targets": [{"expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))"}]
      },
      {
        "title": "AI Inference Time",
        "type": "graph",
        "targets": [{"expr": "histogram_quantile(0.95, rate(ai_inference_duration_seconds_bucket[5m]))"}]
      }
    ]
  }
}
```

### Alerts

```yaml
# alerts.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: evidentis-alerts
  namespace: monitoring
spec:
  groups:
  - name: evidentis
    rules:
    - alert: HighErrorRate
      expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: High error rate detected
        
    - alert: HighLatency
      expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: High latency detected
        
    - alert: PodCrashLooping
      expr: rate(kube_pod_container_status_restarts_total[15m]) > 0
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: Pod restarts detected
        
    - alert: QueueDepthHigh
      expr: sum(bullmq_queue_waiting_jobs) > 1000
      for: 10m
      labels:
        severity: warning
      annotations:
        summary: Queue depth is above expected baseline
        
    - alert: AuthFailuresSpike
      expr: rate(auth_login_failures_total[5m]) > 5
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: Failed authentication attempts are spiking
```

> Note: metric names for queue depth and auth failures depend on your exporter naming. Align these expressions with your actual Prometheus metric names.

---

## Backup Strategy

### Database Backups

```bash
# AWS RDS - Automated backups enabled (30 days retention)
# Manual snapshot
aws rds create-db-snapshot \
  --db-instance-identifier evidentis-production \
  --db-snapshot-identifier evidentis-manual-$(date +%Y%m%d)

# GCP Cloud SQL - Automated backups enabled
gcloud sql backups create --instance=evidentis-production

# Azure - Automated backups enabled
az postgres flexible-server backup create \
  --resource-group evidentis-production \
  --server-name evidentis-db
```

### S3 Backup (Cross-Region Replication)

```bash
# Enable cross-region replication
aws s3api put-bucket-replication \
  --bucket evidentis-documents-production \
  --replication-configuration '{
    "Role": "arn:aws:iam::123456789012:role/replication-role",
    "Rules": [{
      "Status": "Enabled",
      "Priority": 1,
      "DeleteMarkerReplication": {"Status": "Disabled"},
      "Filter": {},
      "Destination": {
        "Bucket": "arn:aws:s3:::evidentis-documents-dr",
        "StorageClass": "STANDARD_IA"
      }
    }]
  }'
```

---

## Security Hardening

### Network Policies

```yaml
# network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-network-policy
  namespace: evidentis
spec:
  podSelector:
    matchLabels:
      app: evidentis-api
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - port: 4000
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: evidentis-ai-service
    ports:
    - port: 5000
  - to:
    - ipBlock:
        cidr: 10.0.0.0/16  # VPC CIDR for RDS/Redis
```

### Pod Security Standards

```yaml
# Apply restricted security context
apiVersion: v1
kind: Pod
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    fsGroup: 1000
    seccompProfile:
      type: RuntimeDefault
  containers:
  - name: api
    securityContext:
      allowPrivilegeEscalation: false
      capabilities:
        drop:
        - ALL
      readOnlyRootFilesystem: true
```

---

## Authentication Configuration

EvidentIS supports **SAML SSO**, **WebAuthn passkeys**, and **SCIM 2.0 provisioning**. Configure these in the API service environment before rollout.

### SAML SSO

Add these environment variables for each identity provider connection:

```bash
SAML_ENABLED=true
SAML_ENTITY_ID=https://api.yourdomain.com/auth/saml/metadata
SAML_ACS_URL=https://api.yourdomain.com/auth/saml/callback
SAML_SLO_URL=https://api.yourdomain.com/auth/saml/logout
SAML_IDP_METADATA_URL=https://idp.example.com/metadata
SAML_IDP_CERT="-----BEGIN CERTIFICATE-----...-----END CERTIFICATE-----"
SAML_NAMEID_FORMAT=urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress
```

Deployment steps:
1. Create a SAML application in your IdP (Okta/Azure AD/Google Workspace).
2. Set ACS URL and Entity ID to the EvidentIS values above.
3. Map email, first name, last name, and group/role attributes.
4. Upload/download metadata and verify `/auth/saml/metadata` plus login callback paths.
5. Test SP-initiated and IdP-initiated login in staging before production.

### WebAuthn (Passkeys)

Configure relying party values exactly to your production domain:

```bash
WEBAUTHN_ENABLED=true
WEBAUTHN_RP_ID=app.yourdomain.com
WEBAUTHN_RP_NAME=EvidentIS
WEBAUTHN_ORIGIN=https://app.yourdomain.com
WEBAUTHN_REQUIRE_RESIDENT_KEY=preferred
WEBAUTHN_USER_VERIFICATION=preferred
```

Deployment steps:
1. Ensure frontend origin and API CORS settings match the WebAuthn origin.
2. Enable HTTPS everywhere (WebAuthn does not work on non-secure origins in production).
3. Register a passkey on a test account, then verify sign-in and fallback MFA paths.

### SCIM 2.0 Provisioning

Use SCIM to automate user and group lifecycle from your IdP:

```bash
SCIM_ENABLED=true
SCIM_BASE_URL=https://api.yourdomain.com/scim/v2
SCIM_BEARER_TOKEN=generate-a-long-random-token
SCIM_PROVISION_DEFAULT_ROLE=member
SCIM_SYNC_DEPROVISION=true
```

Deployment steps:
1. Enable SCIM in your IdP and configure the EvidentIS SCIM base URL.
2. Set bearer token authentication in the IdP SCIM app.
3. Map IdP user/group attributes to EvidentIS fields and roles.
4. Validate create, update, deactivate, and group membership sync flows.

---

## CI/CD Pipeline

### GitHub Actions

The `.github/workflows/ci.yml` handles:
1. Linting and type checking
2. Unit tests with coverage
3. Security scanning (Semgrep, Trivy)
4. Docker image building
5. Kubernetes deployment

### Deployment Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]
    
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
          
      - name: Login to ECR
        uses: aws-actions/amazon-ecr-login@v2
        
      - name: Build and push
        run: |
          docker build -f apps/api/Dockerfile.api -t $ECR_REGISTRY/evidentis/api:$GITHUB_SHA .
          docker push $ECR_REGISTRY/evidentis/api:$GITHUB_SHA
          
      - name: Deploy to EKS
        run: |
          aws eks update-kubeconfig --name evidentis-production
          kubectl set image deployment/api api=$ECR_REGISTRY/evidentis/api:$GITHUB_SHA -n evidentis
          kubectl rollout status deployment/api -n evidentis
```

---

## Troubleshooting

### Common Issues

**1. Pods not starting**
```bash
kubectl describe pod <pod-name> -n evidentis
kubectl logs <pod-name> -n evidentis --previous
```

**2. Database connection issues**
```bash
# Check secrets
kubectl get secret evidentis-secrets -n evidentis -o jsonpath='{.data.DATABASE_URL}' | base64 -d

# Test connection from pod
kubectl run -it --rm debug --image=postgres:16 --restart=Never -- psql $DATABASE_URL
```

**3. High memory usage**
```bash
kubectl top pods -n evidentis
kubectl describe hpa -n evidentis
```

**4. SSL certificate issues**
```bash
kubectl describe certificate evidentis-tls -n evidentis
kubectl get certificaterequest -n evidentis
```

### Useful Commands

```bash
# View all resources
kubectl get all -n evidentis

# View logs
kubectl logs -f deployment/api -n evidentis

# Execute into pod
kubectl exec -it deployment/api -n evidentis -- /bin/sh

# Port forward for debugging
kubectl port-forward svc/api 4000:4000 -n evidentis

# View events
kubectl get events -n evidentis --sort-by='.lastTimestamp'
```

---

## Post-Deployment Checklist

- [ ] All pods running and healthy
- [ ] Database migrations completed
- [ ] SSL certificates valid
- [ ] DNS records configured
- [ ] Health checks passing
- [ ] Monitoring dashboards working
- [ ] Alerts configured
- [ ] Backups verified
- [ ] Load testing completed
- [ ] Security scan passed
- [ ] Documentation updated

---

## Support

For deployment assistance:
- **Email**: devops@evidentis.tech
- **Slack**: #evidentis-deployment
- **Documentation**: https://docs.evidentis.tech/deployment

---

© 2026 EvidentIS Inc. All rights reserved.
