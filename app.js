// Live Weather Dashboard
// Uses the free Open-Meteo APIs (no key needed): geocoding finds the city,
// forecast gives current weather and the next 5 days.

/* ---------- Settings kept in one place ---------- */

const API = {
  geocode: "https://geocoding-api.open-meteo.com/v1/search",
  forecast: "https://api.open-meteo.com/v1/forecast"
};
const STORAGE_KEY = "lastCity";

/* ---------- Page elements ---------- */

const form = document.getElementById("form");
const input = document.getElementById("city");
const button = document.getElementById("search");
const status = document.getElementById("status");
const currentBox = document.getElementById("current");
const forecastSection = document.getElementById("forecast-section");
const forecastList = document.getElementById("forecast");

/* ---------- Weather codes -> text + icon type ---------- */
// Code table from the Open-Meteo documentation (WMO weather codes).

const CODES = {
  0: ["Clear sky", "sun"],
  1: ["Mainly clear", "sun"],
  2: ["Partly cloudy", "cloud"],
  3: ["Overcast", "cloud"],
  45: ["Fog", "fog"],
  48: ["Freezing fog", "fog"],
  51: ["Light drizzle", "rain"],
  53: ["Drizzle", "rain"],
  55: ["Heavy drizzle", "rain"],
  56: ["Freezing drizzle", "rain"],
  57: ["Heavy freezing drizzle", "rain"],
  61: ["Light rain", "rain"],
  63: ["Rain", "rain"],
  65: ["Heavy rain", "rain"],
  66: ["Freezing rain", "rain"],
  67: ["Heavy freezing rain", "rain"],
  71: ["Light snow", "snow"],
  73: ["Snow", "snow"],
  75: ["Heavy snow", "snow"],
  77: ["Snow grains", "snow"],
  80: ["Light showers", "rain"],
  81: ["Showers", "rain"],
  82: ["Heavy showers", "rain"],
  85: ["Snow showers", "snow"],
  86: ["Heavy snow showers", "snow"],
  95: ["Thunderstorm", "storm"],
  96: ["Thunderstorm with hail", "storm"],
  99: ["Severe thunderstorm with hail", "storm"]
};

function describe(code) {
  const item = CODES[code] || ["Unknown", "cloud"];
  return { label: item[0], kind: item[1] };
}

/* ---------- Icons: small SVG line drawings built with the DOM ---------- */

const CLOUD = "M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z";
const ICON_PARTS = {
  sun: ["M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8Z", "M12 2v2", "M12 20v2", "M4.93 4.93l1.41 1.41",
        "M17.66 17.66l1.41 1.41", "M2 12h2", "M20 12h2", "M6.34 17.66l-1.41 1.41", "M19.07 4.93l-1.41 1.41"],
  cloud: [CLOUD],
  fog: [CLOUD, "M16 22H8"],
  rain: ["M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2", "M16 14v6", "M8 14v6", "M12 16v6"],
  snow: ["M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2", "M8 15h.01", "M8 19h.01",
         "M12 17h.01", "M12 21h.01", "M16 15h.01", "M16 19h.01"],
  storm: ["M6 16.3A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 .5 9", "M13 12l-3 5h4l-3 5"]
};

function makeIcon(kind) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("focusable", "false");
  (ICON_PARTS[kind] || ICON_PARTS.cloud).forEach(function (d) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    svg.append(path);
  });
  return svg;
}

/* ---------- Errors the user should read ---------- */
// AppError = a friendly message we wrote. Anything else (fetch failing
// because the network is down) is shown as a network problem.

class AppError extends Error {}

/* ---------- Data layer ---------- */

async function findCity(name) {
  const url = API.geocode + "?count=1&language=en&format=json&name=" + encodeURIComponent(name);
  const res = await fetch(url);
  if (!res.ok) throw new AppError("The search service is not responding. Please try again.");
  const data = await res.json();
  if (!data.results || !data.results.length) throw new AppError("City not found. Check the spelling and try again.");
  const c = data.results[0];
  return { name: c.name, country: c.country || "", lat: c.latitude, lon: c.longitude };
}

async function getWeather(lat, lon) {
  const url = API.forecast +
    "?latitude=" + encodeURIComponent(lat) +
    "&longitude=" + encodeURIComponent(lon) +
    "&current=temperature_2m,weather_code" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min" +
    "&forecast_days=5&timezone=auto";
  const res = await fetch(url);
  if (!res.ok) throw new AppError("Could not load the forecast. Please try again.");
  const data = await res.json();
  if (!data.current || !data.daily || !data.daily.time) {
    throw new AppError("The weather service sent an unexpected reply.");
  }
  return data;
}

/* ---------- Helpers ---------- */

// "2026-11-20" -> a local Date. new Date("2026-11-20") would be read as UTC

function parseDay(text) {
  const p = text.split("-");
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function deg(value) {
  return Math.round(value) + "\u00B0";
}

function setStatus(message, state) {
  status.textContent = message;
  status.dataset.state = state || "";
}

function setLoading(isLoading) {
  button.disabled = isLoading;
  button.textContent = isLoading ? "Loading..." : "Search";
}

function showResults(isVisible) {
  currentBox.hidden = !isVisible;
  forecastSection.hidden = !isVisible;
}

function remember(name) {
  try { localStorage.setItem(STORAGE_KEY, name); } catch (e) { /* storage blocked: ignore */ }
}

function recall() {
  try { return localStorage.getItem(STORAGE_KEY) || ""; } catch (e) { return ""; }
}

/* ---------- Rendering (textContent only, never innerHTML) ---------- */

function render(city, data) {
  const now = describe(data.current.weather_code);
  const place = city.country ? city.name + ", " + city.country : city.name;

  document.getElementById("place").textContent = place;
  document.getElementById("today").textContent =
    parseDay(data.daily.time[0]).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  document.getElementById("condition").textContent = now.label;
  document.getElementById("temp").textContent = deg(data.current.temperature_2m) + "C";
  document.getElementById("range").textContent =
    "High " + deg(data.daily.temperature_2m_max[0]) + "  |  Low " + deg(data.daily.temperature_2m_min[0]);

  const iconBox = document.getElementById("current-icon");
  iconBox.textContent = "";
  iconBox.append(makeIcon(now.kind));

  forecastList.textContent = "";
  data.daily.time.forEach(function (day, i) {
    const info = describe(data.daily.weather_code[i]);

    const li = document.createElement("li");
    li.className = "day";

    const icon = document.createElement("span");
    icon.className = "icon";
    icon.setAttribute("aria-hidden", "true");
    icon.append(makeIcon(info.kind));

    const text = document.createElement("div");
    text.className = "day-text";
    const name = document.createElement("span");
    name.className = "day-name";
    name.textContent = i === 0 ? "Today" :
      parseDay(day).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
    const label = document.createElement("span");
    label.className = "day-label";
    label.textContent = info.label;
    text.append(name, label);

    const temps = document.createElement("p");
    temps.className = "day-temps";
    temps.textContent = deg(data.daily.temperature_2m_max[i]) + " ";
    const min = document.createElement("span");
    min.className = "day-min";
    min.textContent = deg(data.daily.temperature_2m_min[i]);
    temps.append(min);

    li.append(icon, text, temps);
    forecastList.append(li);
  });

  showResults(true);
}

/* ---------- Search flow ---------- */

let latestRequest = 0; 

async function search(rawName) {
  const name = rawName.trim();

  // Validation: empty or too short input
  if (!name) {
    setStatus("Please type a city name.", "error");
    input.focus();
    return;
  }
  if (name.length < 2) {
    setStatus("Type at least 2 letters.", "error");
    input.focus();
    return;
  }

  const requestId = ++latestRequest;
  setLoading(true);
  setStatus("Loading weather...", "loading");

  try {
    const city = await findCity(name);
    const data = await getWeather(city.lat, city.lon);
    if (requestId !== latestRequest) return;
    render(city, data);
    remember(name);
    setStatus("Showing weather for " + city.name + ".", "");
  } catch (err) {
    if (requestId !== latestRequest) return;
    showResults(false);
    if (err instanceof AppError) {
      setStatus(err.message, "error");
    } else {
      setStatus("Network problem. Check your internet connection and try again.", "error");
    }
  } finally {
    if (requestId === latestRequest) setLoading(false);
  }
}

form.addEventListener("submit", function (e) {
  e.preventDefault();
  search(input.value);
});


const saved = recall();
if (saved) {
  input.value = saved;
  search(saved);
} else {
  setStatus("Type a city name and press Search.", "");
}