# How to Deploy HSK Tutor for Free

Since your app uses **Supabase** (Database & Auth) and **React/Vite** (Frontend), you can deploy it easily for free.

## 1. Backend (Supabase)
Your backend is already "deployed" in the cloud! You just need to update the security settings for your production URL.

1.  Go to [Supabase Dashboard](https://supabase.com/dashboard).
2.  Navigate to **Authentication** > **URL Configuration**.
3.  **Site URL:** Change this to your production URL (e.g., `https://my-hsk-tutor.vercel.app`) once you have it.
4.  **Redirect URLs:** Add your production URL + `/auth/callback` (if using redirects) or just the domain (if using popups).
    *   Example: `https://my-hsk-tutor.vercel.app`
    *   Example: `https://my-hsk-tutor.vercel.app/`

## 2. Frontend (Vercel) - Recommended
Vercel is the best host for Vite/React apps.

1.  **Download your code:**
    *   Click the "Export" or "Download" button in AI Studio to get your project files.
2.  **Push to GitHub:**
    *   Create a new repository on GitHub.
    *   Push your code to it.
3.  **Deploy on Vercel:**
    *   Go to [vercel.com](https://vercel.com) and sign up/login.
    *   Click **"Add New..."** > **"Project"**.
    *   Import your GitHub repository.
    *   **IMPORTANT:** In the "Environment Variables" section, add:
        *   `VITE_SUPABASE_URL`: (Your Supabase URL)
        *   `VITE_SUPABASE_ANON_KEY`: (Your Supabase Anon Key)
    *   Click **Deploy**.

## 3. Frontend (Netlify) - Alternative
1.  **Push to GitHub** (same as above).
2.  **Deploy on Netlify:**
    *   Go to [netlify.com](https://netlify.com).
    *   "Import from Git".
    *   **Build Settings:**
        *   Build command: `npm run build`
        *   Publish directory: `dist`
    *   **Environment Variables:**
        *   Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
    *   Click **Deploy**.

## 4. Google OAuth (Production)
If you use Google Login:
1.  Go to **Google Cloud Console**.
2.  Edit your OAuth Client.
3.  Add your new Vercel/Netlify domain to **"Authorized JavaScript origins"**.
4.  Add your Supabase Callback URL is already correct, so no changes needed there unless you changed the Supabase project.
