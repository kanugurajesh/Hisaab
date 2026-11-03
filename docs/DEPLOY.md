# Deploying

There are two ways to run Hisaab in the cloud:

- **Public demo (free): Render + Neon.** One container that resets the demo account on every start. Below.
- **Production: Google Cloud.** Cloud Run, Cloud SQL, a private GCS bucket and Secret Manager, deployed from GitHub Actions. [Further down](#production-google-cloud).

## Public demo: Render + Neon

The `demo` stage of the `Dockerfile` (the last stage, which Render builds) does this on every start:

1. applies the migrations
2. re-seeds the demo account (on mock AI, so starting never spends model calls)
3. serves the app with the passwordless demo login on

Everything visitors do runs on the real models. Uploads are kept on the container's disk, so they disappear when Render restarts or sleeps the free instance. The demo account's own data comes back from the seed each time.

1. **Database.** Create a free project at [neon.tech](https://neon.tech) and copy the **direct** connection string, not the pooled one (Prisma migrations need a direct connection). It looks like `postgresql://user:pw@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`.
2. **App.** On [render.com](https://render.com), choose **New → Blueprint**, pick this repository, and Render reads `render.yaml`. It asks for two values:
   - `DATABASE_URL`: the Neon string from step 1
   - `GROQ_API_KEY`: your Groq key

   `NEXTAUTH_SECRET` is generated for you. The public URL (`https://hisaab-xxxx.onrender.com`) is picked up from Render's `RENDER_EXTERNAL_URL` for links and sign-in.
3. **Check it.** Open the URL and choose **Try the demo organizer account**. The free instance sleeps after 15 minutes idle, so the first visit after that takes about a minute to wake up.

Every push to `main` redeploys it.

## Production: Google Cloud

The app runs on **Cloud Run** (Mumbai, `asia-south1`), with **Cloud SQL for Postgres**, a private **GCS bucket** for payment screenshots, and **Secret Manager** for keys. GitHub Actions deploys via Workload Identity Federation, so no JSON keys are stored in GitHub. The deploy workflow is skipped until `GCP_PROJECT_ID` is set.

### One-time setup

```bash
PROJECT=your-project-id
REGION=asia-south1
gcloud config set project $PROJECT
gcloud services enable run.googleapis.com sqladmin.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com iamcredentials.googleapis.com

# Images
gcloud artifacts repositories create hisaab --repository-format=docker --location=$REGION

# Database
gcloud sql instances create hisaab-db --database-version=POSTGRES_16 --tier=db-f1-micro --region=$REGION
gcloud sql databases create hisaab --instance=hisaab-db
gcloud sql users create hisaab --instance=hisaab-db --password='<strong-password>'

# Private bucket for proofs (never public; served through an authenticated route)
gcloud storage buckets create gs://$PROJECT-hisaab-proofs --location=$REGION --uniform-bucket-level-access \
  --public-access-prevention

# Secrets
printf 'postgresql://hisaab:<pw>@localhost/hisaab?host=/cloudsql/%s:%s:hisaab-db' $PROJECT $REGION \
  | gcloud secrets create database-url --data-file=-
printf '%s' "$GROQ_API_KEY" | gcloud secrets create groq-api-key --data-file=-
openssl rand -base64 32 | gcloud secrets create nextauth-secret --data-file=-
```

Grant the Cloud Run runtime service account `roles/cloudsql.client`, `roles/secretmanager.secretAccessor` and `roles/storage.objectAdmin` on the bucket.

Create a Workload Identity pool and provider for GitHub, plus a deploy service account with `roles/run.admin`, `roles/artifactregistry.writer` and `roles/iam.serviceAccountUser`. Then follow [google-github-actions/auth](https://github.com/google-github-actions/auth#workload-identity-federation-through-a-service-account).

### GitHub configuration

| Kind | Name | Example |
|---|---|---|
| Secret | `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/123/locations/global/workloadIdentityPools/github/providers/github` |
| Secret | `GCP_DEPLOY_SERVICE_ACCOUNT` | `deployer@PROJECT.iam.gserviceaccount.com` |
| Variable | `GCP_PROJECT_ID` | `your-project-id` |
| Variable | `CLOUDSQL_INSTANCE` | `your-project-id:asia-south1:hisaab-db` |
| Variable | `GCS_BUCKET` | `your-project-id-hisaab-proofs` |
| Variable | `APP_URL` | `https://hisaab-xxxx.a.run.app` |

Every push to `main` runs CI. Only when CI is green does the deploy workflow run:

1. Build and push the app image and the migration image.
2. Run `prisma migrate deploy` as a Cloud Run Job.
3. Roll out the new service revision.
