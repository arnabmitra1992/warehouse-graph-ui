# Frontend Deployment Guide

This UI is a static Vite app. The simplest shared setup is:

- backend API running on your Cologne server
- frontend built once and hosted as static files

## 1. Point the UI to the shared backend

Create a production env file:

```bash
cp .env.example .env.production
```

Then set:

```bash
VITE_SIMULATOR_API_BASE_URL=https://sim.your-domain.com
VITE_APP_BASE_PATH=/
```

If you host the UI under a subpath, for example `https://your-domain.com/warehouse-graph-ui/`, use:

```bash
VITE_APP_BASE_PATH=/warehouse-graph-ui/
```

## 2. Build the app

```bash
npm install
npm run build
```

This creates a production bundle in `dist/`.

## 3. Host the static files

Any static host works:

- GitHub Pages
- Vercel
- Netlify
- company nginx server
- company Apache server

## 4. Example: upload to a company server with nginx

Build locally, then copy the `dist/` contents to a directory on the server, for example:

```bash
/var/www/warehouse-graph-ui
```

Example nginx site block:

```nginx
server {
    listen 80;
    server_name warehouse-ui.your-domain.com;

    root /var/www/warehouse-graph-ui;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

If the backend is at `https://sim.your-domain.com`, the UI will call it directly from the browser.

## 5. Team-use notes

- Rebuild the frontend whenever UI code changes.
- Restart or rebuild the backend container whenever backend code changes.
- Keep the backend URL in `.env.production` aligned with the server hostname.
