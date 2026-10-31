# Deploying to Google Cloud

The app runs on **Cloud Run** (Mumbai, `asia-south1`), with **Cloud SQL for Postgres**, a private **GCS bucket** for payment screenshots, and **Secret Manager** for keys. GitHub Actions deploys via Workload Identity Federation, so no JSON keys are stored in GitHub.

## One-time setup

```bash
PROJECT=your-project-id
REGION=asia-south1
gcloud config set project $PROJECT
gcloud services enable run.googleapis.com sqladmin.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com iamcredentials.googleapis.com

# Images
gcloud artifacts repositories create choruss --repository-format=docker --location=$REGION

# Database
gcloud sql instances create choruss-db --database-version=POSTGRES_16 --tier=db-f1-micro --region=$REGION
gcloud sql databases create choruss --instance=choruss-db
gcloud sql users create choruss --instance=choruss-db --password='<strong-password>'

# Private bucket for proofs (never public; served through an authenticated route)
gcloud storage buckets create gs://$PROJECT-choruss-proofs --location=$REGION --uniform-bucket-level-access \
  --public-access-prevention

# Secrets
printf 'postgresql://choruss:<pw>@localhost/choruss?host=/cloudsql/%s:%s:choruss-db' $PROJECT $REGION \
  | gcloud secrets create database-url --data-file=-
printf '%s' "$GROQ_API_KEY" | gcloud secrets create groq-api-key --data-file=-
openssl rand -base64 32 | gcloud secrets create nextauth-secret --data-file=-
printf '%s' "$GOOGLE_CLIENT_SECRET" | gcloud secrets create google-client-secret --data-file=-
```

Grant the Cloud Run runtime service account `roles/cloudsql.client`, `roles/secretmanager.secretAccessor` and `roles/storage.objectAdmin` on the bucket.

Create a Workload Identity pool and provider for GitHub, plus a deploy service account with `roles/run.admin`, `roles/artifactregistry.writer` and `roles/iam.serviceAccountUser`. Then follow [google-github-actions/auth](https://github.com/google-github-actions/auth#workload-identity-federation-through-a-service-account).

## GitHub configuration

| Kind | Name | Example |
|---|---|---|
| Secret | `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/123/locations/global/workloadIdentityPools/github/providers/github` |
| Secret | `GCP_DEPLOY_SERVICE_ACCOUNT` | `deployer@PROJECT.iam.gserviceaccount.com` |
| Variable | `GCP_PROJECT_ID` | `your-project-id` |
| Variable | `CLOUDSQL_INSTANCE` | `your-project-id:asia-south1:choruss-db` |
| Variable | `GCS_BUCKET` | `your-project-id-choruss-proofs` |
| Variable | `APP_URL` | `https://choruss-hisaab-xxxx.a.run.app` |
| Variable | `GOOGLE_CLIENT_ID` | OAuth client id (redirect URI: `$APP_URL/api/auth/callback/google`) |

Every push to `main` runs CI. Only when CI is green does the deploy workflow run:

1. Build and push the app image and the migration image.
2. Run `prisma migrate deploy` as a Cloud Run Job.
3. Roll out the new service revision.
