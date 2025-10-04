# Backend Environment Variables Setup

This document lists all required environment variables for the backend application.

## Required Environment Variables

Create a `.env.local` file in the root of the backend project with the following variables:

### Database Configuration

```bash
# Database URL (PostgreSQL)
DATABASE_URL="postgresql://user:password@localhost:5432/dbname"
```

### JWT Configuration

```bash
# JWT Secret (must match frontend)
JWT_SECRET=your-jwt-secret-here
```

### NextAuth Configuration

```bash
# NextAuth Secret (generate with: openssl rand -base64 32)
NEXTAUTH_SECRET=your-nextauth-secret-here
```

### Cloudflare R2 Configuration

```bash
# R2 Bucket Name
R2_BUCKET_NAME=threadheaven

# Cloudflare Account ID (found in your Cloudflare dashboard)
CLOUDFLARE_ACCOUNT_ID=your-cloudflare-account-id

# R2 Access Credentials (create in Cloudflare R2 settings)
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key

# R2 Public Bucket URL
# This is the public URL where your R2 bucket is accessible
# Example: https://pub-167bcbb6797c48d686d7dacfba94f17f.r2.dev
R2_PUBLIC_BUCKET_URL=https://pub-your-r2-public-url.r2.dev
```

### Google OAuth (Optional)

```bash
# Google OAuth credentials (if using Google sign-in)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

### Stripe Configuration (Optional)

```bash
# Stripe API credentials (if using payment features)
STRIPE_API_KEY=your-stripe-api-key
STRIPE_WEBHOOK_SECRET=your-stripe-webhook-secret
```

### Frontend URL

```bash
# Frontend URL (for CORS and redirects)
FRONTEND_URL=http://localhost:3001
```

## How to Get Cloudflare R2 Credentials

### Step 1: Create R2 Bucket

1. Go to your Cloudflare dashboard
2. Navigate to R2 Object Storage
3. Click "Create bucket"
4. Name it (e.g., "threadheaven")
5. Click "Create bucket"

### Step 2: Enable Public Access

1. Go to your bucket settings
2. Under "Public Access", click "Allow Access"
3. Copy the public URL (e.g., `https://pub-xxx.r2.dev`)
4. Set this as your `R2_PUBLIC_BUCKET_URL`

### Step 3: Create API Tokens

1. In Cloudflare dashboard, go to R2
2. Click "Manage R2 API Tokens"
3. Click "Create API Token"
4. Give it a name (e.g., "ThreadTake Production")
5. Set permissions to "Object Read & Write"
6. Copy the Access Key ID and Secret Access Key
7. Set these as `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`

### Step 4: Get Account ID

1. In Cloudflare dashboard, look at the URL or sidebar
2. Your Account ID is visible in the dashboard
3. Set this as `CLOUDFLARE_ACCOUNT_ID`

## Example .env.local File

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/threadtake"
JWT_SECRET=your-jwt-secret-here
NEXTAUTH_SECRET=your-nextauth-secret-here
R2_BUCKET_NAME=threadheaven
CLOUDFLARE_ACCOUNT_ID=your-account-id-here
R2_ACCESS_KEY_ID=your-access-key-id-here
R2_SECRET_ACCESS_KEY=your-secret-access-key-here
R2_PUBLIC_BUCKET_URL=https://pub-167bcbb6797c48d686d7dacfba94f17f.r2.dev
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
FRONTEND_URL=http://localhost:3001
```

## Important Notes

- Make sure the `JWT_SECRET` is the same in both frontend and backend
- The `R2_PUBLIC_BUCKET_URL` must be the same in both frontend and backend
- Never commit `.env.local` files to version control
- Use strong, randomly generated secrets for production
