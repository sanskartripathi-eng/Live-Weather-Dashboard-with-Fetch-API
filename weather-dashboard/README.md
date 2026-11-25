# Live Weather Dashboard

A responsive weather website that fetches real-time conditions and a 5-day forecast for any city, built with vanilla HTML, CSS, and JavaScript.

## Features
- Current temperature, feels-like, humidity, wind, and today's high/low
- 5-day forecast with weather icons and chance of rain
- City search with input validation and clear error states (no match, offline, timeout, API error)
- Disambiguation when a city name matches several places
- °C / °F toggle and "Use my location" button
- Recent searches saved in `localStorage`
- Background that changes with the weather and time of day
- Loading skeletons, keyboard focus styles, and reduced-motion support

## Concepts practiced
- Asynchronous JavaScript with `fetch` and `async/await`
- Request cancellation with `AbortController` and timeouts
- Dynamic DOM injection with `createElement` (no `innerHTML`)
- Form validation and user-friendly error handling

## Run it
No build step or API key needed. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploy on GitHub Pages
1. Push this folder to a GitHub repository.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, then save.
4. Your site will be live at `https://<your-username>.github.io/<repo-name>/`.

## Project structure
```
weather-dashboard/
├── index.html
├── css/style.css
├── js/app.js
└── README.md
```

## Data source
Weather and geocoding data from [Open-Meteo](https://open-meteo.com/) (free, no API key).
