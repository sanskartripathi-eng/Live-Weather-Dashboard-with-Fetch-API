(() => {
  "use strict";

  // ---------- Config ----------
  const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
  const WX_URL = "https://api.open-meteo.com/v1/forecast";
  const TIMEOUT_MS = 10000;
  const RECENT_KEY = "weather.recent";

  // WMO weather codes -> label, icon, sky theme
  const CODES = {
    0: ["Clear sky", "☀️", "clear"], 1: ["Mostly clear", "🌤️", "clear"],
    2: ["Partly cloudy", "⛅", "cloud"], 3: ["Overcast", "☁️", "cloud"],
    45: ["Fog", "🌫️", "fog"], 48: ["Freezing fog", "🌫️", "fog"],
    51: ["Light drizzle", "🌦️", "rain"], 53: ["Drizzle", "🌦️", "rain"], 55: ["Heavy drizzle", "🌧️", "rain"],
    56: ["Freezing drizzle", "🌧️", "rain"], 57: ["Freezing drizzle", "🌧️", "rain"],
    61: ["Light rain", "🌦️", "rain"], 63: ["Rain", "🌧️", "rain"], 65: ["Heavy rain", "🌧️", "rain"],
    66: ["Freezing rain", "🌧️", "rain"], 67: ["Freezing rain", "🌧️", "rain"],
    71: ["Light snow", "🌨️", "snow"], 73: ["Snow", "❄️", "snow"], 75: ["Heavy snow", "❄️", "snow"],
    77: ["Snow grains", "❄️", "snow"],
    80: ["Rain showers", "🌦️", "rain"], 81: ["Rain showers", "🌧️", "rain"], 82: ["Violent showers", "⛈️", "rain"],
    85: ["Snow showers", "🌨️", "snow"], 86: ["Heavy snow showers", "🌨️", "snow"],
    95: ["Thunderstorm", "⛈️", "storm"], 96: ["Thunderstorm with hail", "⛈️", "storm"], 99: ["Thunderstorm with hail", "⛈️", "storm"]
  };
  const lookup = (code) => CODES[code] || ["Unknown", "🌡️", "cloud"];

  // ---------- DOM refs ----------
  const form = document.getElementById("search");
  const input = document.getElementById("city");
  const goBtn = document.getElementById("go");
  const locateBtn = document.getElementById("locate");
  const hint = document.getElementById("hint");
  const recentEl = document.getElementById("recent");
  const out = document.getElementById("out");

  // ---------- State ----------
  let place = null;              // { name, region, lat, lon }
  let controller = null;         // AbortController for the in-flight request
  let units = "metric";

  // ---------- Small DOM helper (dynamic injection without innerHTML) ----------
  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c != null) el.append(c.nodeType ? c : document.createTextNode(c));
    }
    return el;
  }
  const mount = (...nodes) => { out.replaceChildren(...nodes); };

  // ---------- Validation ----------
  function validateCity(raw) {
    const value = raw.trim().replace(/\s+/g, " ");
    if (!value) return { error: "Enter a city name to search." };
    if (value.length < 2) return { error: "Use at least 2 characters." };
    if (value.length > 60) return { error: "City names are limited to 60 characters." };
    if (!/^[\p{L}\p{M}\s.,'’-]+$/u.test(value)) {
      return { error: "Use letters only. Numbers and symbols aren’t supported." };
    }
    return { value };
  }
  function setHint(msg) {
    hint.textContent = msg || "";
    input.setAttribute("aria-invalid", msg ? "true" : "false");
  }

  // ---------- Fetch layer (async/await) ----------
  async function getJSON(url, signal) {
    const own = controller;
    const timer = setTimeout(() => own && own.abort("timeout"), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`The weather service returned an error (${res.status}).`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function geocode(name, signal) {
    const url = `${GEO_URL}?name=${encodeURIComponent(name)}&count=5&language=en&format=json`;
    const data = await getJSON(url, signal);
    return (data.results || []).map((r) => ({
      name: r.name,
      region: [r.admin1, r.country].filter(Boolean).join(", "),
      lat: r.latitude,
      lon: r.longitude
    }));
  }

  async function fetchWeather(p, signal) {
    const params = new URLSearchParams({
      latitude: p.lat,
      longitude: p.lon,
      current: "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      forecast_days: 5,
      timezone: "auto",
      temperature_unit: units === "imperial" ? "fahrenheit" : "celsius",
      wind_speed_unit: units === "imperial" ? "mph" : "kmh"
    });
    return getJSON(`${WX_URL}?${params}`, signal);
  }

  // ---------- Rendering ----------
  function renderLoading() {
    out.setAttribute("aria-busy", "true");
    mount(
      h("div", { class: "skel", style: "height:70px;width:60%" }),
      h("div", { class: "skel", style: "height:130px;width:70%;margin-top:18px" }),
      h("div", { class: "skel", style: "height:80px;margin-top:24px" }),
      h("div", { class: "skel", style: "height:150px;margin-top:24px" })
    );
  }

  function renderIdle() {
    out.setAttribute("aria-busy", "false");
    mount(h("div", { class: "notice" },
      h("h2", { text: "Check the weather anywhere" }),
      h("p", { text: "Search for a city to see current conditions and the next five days." })
    ));
  }

  function renderError(title, message, retry) {
    out.setAttribute("aria-busy", "false");
    mount(h("div", { class: "notice error", role: "alert" },
      h("h2", { text: title }),
      h("p", { text: message }),
      retry ? h("button", { class: "btn", type: "button", onclick: retry, text: "Try again" }) : null
    ));
  }

  function renderMatches(query, matches) {
    out.setAttribute("aria-busy", "false");
    mount(h("div", { class: "notice" },
      h("h2", { text: `Which “${query}” do you mean?` }),
      h("p", { text: "Pick a location to load its weather." }),
      h("div", { class: "matches" },
        h("ul", { class: "recent" }, matches.map((m) =>
          h("li", {}, h("button", {
            class: "chip", type: "button",
            onclick: () => loadPlace(m),
            text: `${m.name}${m.region ? ", " + m.region : ""}`
          }))
        ))
      )
    ));
  }

  function renderWeather(p, data) {
    const cur = data.current;
    const d = data.daily;
    const u = data.current_units;
    const [label, icon, theme] = lookup(cur.weather_code);
    document.body.dataset.sky = `${theme}-${cur.is_day ? "day" : "night"}`;

    const deg = units === "imperial" ? "°F" : "°C";
    const windUnit = units === "imperial" ? "mph" : "km/h";
    const round = (n) => Math.round(n);

    const now = h("div", { class: "now" },
      h("div", {},
        h("h2", { class: "place", style: "margin:0", text: p.name }),
        h("p", { class: "region", text: p.region || "" }),
        h("p", { class: "temp", "aria-label": `${round(cur.temperature_2m)} degrees` },
          String(round(cur.temperature_2m)), h("sup", { text: deg }))
      ),
      h("div", { class: "glyph", "aria-hidden": "true", text: icon }),
      h("p", { class: "cond", text: label })
    );

    const stat = (name, value) => h("div", { class: "stat" }, h("dt", { text: name }), h("dd", { text: value }));
    const stats = h("dl", { class: "stats" },
      stat("Feels like", `${round(cur.apparent_temperature)}${deg}`),
      stat("Humidity", `${cur.relative_humidity_2m}${u.relative_humidity_2m}`),
      stat("Wind", `${round(cur.wind_speed_10m)} ${windUnit}`),
      stat("Today’s range", `${round(d.temperature_2m_min[0])}° / ${round(d.temperature_2m_max[0])}°`)
    );

    const days = h("div", { class: "days" }, d.time.map((iso, i) => {
      const [dl, di] = lookup(d.weather_code[i]);
      const date = new Date(`${iso}T12:00:00`);
      const dow = i === 0 ? "Today" : date.toLocaleDateString(undefined, { weekday: "short" });
      const rain = d.precipitation_probability_max[i];
      return h("div", { class: "day" },
        h("div", { class: "dow", text: dow }),
        h("div", { class: "ico", "aria-hidden": "true", text: di }),
        h("div", { class: "hi", text: `${round(d.temperature_2m_max[i])}°` }),
        h("div", { class: "lo", text: `${round(d.temperature_2m_min[i])}°` }),
        h("div", { class: "sum", text: rain != null ? `${dl}, ${rain}% rain` : dl })
      );
    }));

    out.setAttribute("aria-busy", "false");
    mount(
      now,
      stats,
      h("h2", { text: "5-day forecast" }),
      days,
      h("p", { class: "updated", text: `Updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` }),
      h("p", { class: "credit" }, "Data by ",
        h("a", { href: "https://open-meteo.com/", target: "_blank", rel: "noopener", text: "Open-Meteo" }))
    );
  }

  // ---------- Recent searches (localStorage, fail-safe) ----------
  function readRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; }
  }
  function saveRecent(p) {
    try {
      const list = readRecent().filter((r) => !(r.lat === p.lat && r.lon === p.lon));
      list.unshift(p);
      localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 5)));
    } catch { /* storage unavailable: ignore */ }
    renderRecent();
  }
  function renderRecent() {
    recentEl.replaceChildren(...readRecent().map((p) =>
      h("li", {}, h("button", { class: "chip", type: "button", onclick: () => loadPlace(p), text: p.name }))
    ));
  }

  // ---------- Controller ----------
  function busy(on) {
    goBtn.disabled = on;
    locateBtn.disabled = on;
  }

  function friendlyError(err) {
    if (err === "replaced" || (err && err.name === "AbortError")) return null; // cancelled by a newer search
    if (err === "timeout") return ["Request timed out", "The weather service took too long to respond. Check your connection and try again."];
    if (!navigator.onLine) return ["You’re offline", "Reconnect to the internet, then try again."];
    return ["Couldn’t load the weather", err && err.message ? err.message : "Something went wrong. Try again in a moment."];
  }

  async function loadPlace(p) {
    if (controller) controller.abort("replaced");
    controller = new AbortController();
    const { signal } = controller;

    place = p;
    renderLoading();
    busy(true);
    try {
      const data = await fetchWeather(p, signal);
      if (signal.aborted) return;
      renderWeather(p, data);
      saveRecent(p);
    } catch (err) {
      if (signal.aborted && signal.reason === "replaced") return;
      const info = friendlyError(err);
      if (info) renderError(info[0], info[1], () => loadPlace(p));
    } finally {
      if (!signal.aborted || signal.reason !== "replaced") busy(false);
    }
  }

  async function searchCity(query) {
    if (controller) controller.abort("replaced");
    controller = new AbortController();
    const { signal } = controller;

    renderLoading();
    busy(true);
    try {
      const matches = await geocode(query, signal);
      if (signal.aborted) return;
      if (matches.length === 0) {
        renderError("No city found", `We couldn’t find “${query}”. Check the spelling or try a larger nearby city.`);
        busy(false);
        return;
      }
      busy(false);
      if (matches.length === 1 || matches[0].name.toLowerCase() === query.toLowerCase() && matches.slice(1).every((m) => m.name.toLowerCase() !== query.toLowerCase())) {
        await loadPlace(matches[0]);
      } else {
        renderMatches(query, matches);
      }
    } catch (err) {
      if (signal.aborted && signal.reason === "replaced") return;
      busy(false);
      const info = friendlyError(err);
      if (info) renderError(info[0], info[1], () => searchCity(query));
    }
  }

  // ---------- Events ----------
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const result = validateCity(input.value);
    if (result.error) {
      setHint(result.error);
      input.focus();
      return;
    }
    setHint("");
    searchCity(result.value);
  });

  input.addEventListener("input", () => { if (hint.textContent) setHint(""); });

  form.addEventListener("change", (e) => {
    if (e.target.name === "unit") {
      units = e.target.value;
      if (place) loadPlace(place);
    }
  });

  locateBtn.addEventListener("click", () => {
    if (!("geolocation" in navigator)) {
      setHint("Your browser doesn’t support location. Search for a city instead.");
      return;
    }
    setHint("");
    busy(true);
    renderLoading();
    navigator.geolocation.getCurrentPosition(
      (pos) => loadPlace({ name: "Your location", region: "", lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => {
        busy(false);
        const denied = err.code === err.PERMISSION_DENIED;
        renderError(
          denied ? "Location access blocked" : "Couldn’t get your location",
          denied ? "Allow location access in your browser settings, or search for a city instead."
                 : "Your position isn’t available right now. Search for a city instead."
        );
      },
      { timeout: 8000 }
    );
  });

  // ---------- Init ----------
  renderRecent();
  const last = readRecent()[0];
  if (last) loadPlace(last); else renderIdle();
})();
