// location-search.js
// Handles location auto-suggestion and triggers weather API updates

const CSV_URL = '/elements/files/locations.csv';

let locations = [];
let selectedLocation = null;

const searchInput = document.getElementById('location-search');
const suggestionsBox = document.getElementById('location-suggestions');

// Utility: Normalize string (for case-insensitive, diacritic-insensitive search)
function normalize(str) {
  return str.toLowerCase().normalize('NFD').replace(/[\0-\u036f]/g, '');
}

// Utility: Highlight matched text in suggestion
function highlightMatch(text, query) {
  const nQuery = normalize(query);
  const nText = normalize(text);
  const idx = nText.indexOf(nQuery);
  if (idx < 0) return text;
  return text.slice(0, idx) + '<span class="bg-yellow-200">' + text.slice(idx, idx + query.length) + '</span>' + text.slice(idx + query.length);
}

// Load and parse CSV
function loadLocations() {
  Papa.parse(CSV_URL, {
    download: true,
    header: true,
    complete: (results) => {
      locations = results.data
        .filter(r => r.zip && r.city && r.state_id && r.lat && r.lng)
        .map(r => ({
          ...r,
          display: `${r.city}, ${r.state_id} ${r.zip}`,
          search: [r.zip, r.city, r.state_id].join(' ')
        }));
    }
  });
}

// Show suggestions based on input
function showSuggestions(query) {
  if (!query || query.length < 2) {
    suggestionsBox.classList.add('hidden');
    suggestionsBox.innerHTML = '';
    return;
  }
  const q = normalize(query);
  const matches = locations.filter(loc =>
    normalize(loc.zip).startsWith(q) ||
    normalize(loc.city).includes(q) ||
    normalize(loc.state_id).startsWith(q)
  ).slice(0, 15);
  if (matches.length === 0) {
    suggestionsBox.classList.add('hidden');
    suggestionsBox.innerHTML = '';
    return;
  }
  suggestionsBox.innerHTML = matches.map(loc =>
    `<li class="px-4 py-2 cursor-pointer hover:bg-gray-100"
        data-zip="${loc.zip}" data-lat="${loc.lat}" data-lng="${loc.lng}" data-city="${loc.city}" data-state="${loc.state_id}">
      ${highlightMatch(loc.display, query)}
    </li>`
  ).join('');
  suggestionsBox.classList.remove('hidden');
}

// Handle suggestion click
function onSuggestionClick(e) {
  const li = e.target.closest('li[data-zip]');
  if (!li) return;
  const lat = parseFloat(li.dataset.lat);
  const lng = parseFloat(li.dataset.lng);
  const city = li.dataset.city;
  const state = li.dataset.state;

  selectedLocation = { lat, lng, city, state, zip: li.dataset.zip };
  searchInput.value = `${city}, ${state} ${li.dataset.zip}`;
  suggestionsBox.classList.add('hidden');
  suggestionsBox.innerHTML = '';

  // Fetch and update weather UI for this location
  fetchWeatherForLocation(selectedLocation);
}

// Enforce selection from dropdown (no freeform)
function enforceSelection(e) {
  // If the input doesn't match the selectedLocation, clear selection
  if (!selectedLocation || searchInput.value !== `${selectedLocation.city}, ${selectedLocation.state} ${selectedLocation.zip}`) {
    selectedLocation = null;
    // Optionally: Clear the weather UI here if needed
  }
}

// Fetch weather from NWS API (placeholder)
function fetchWeatherForLocation(location) {
  // You would implement actual API calls here.
  // For demonstration, we'll just update the UI with fake data:
  document.querySelector('#weather-current h2').textContent =
    `${location.city}, ${location.state} - Current Conditions`;
  document.querySelector('#weather-current .text-7xl').textContent = '72°F';
  document.querySelector('#weather-current .text-xl').textContent = 'Partly Cloudy';
  document.querySelector('#weather-current .mt-4 p:nth-child(1)').textContent = 'Feels Like: 70°F';
  document.querySelector('#weather-current .mt-4 p:nth-child(2)').textContent = 'Humidity: 50%';
  document.querySelector('#weather-current .mt-4 p:nth-child(3)').textContent = 'Wind: 8 mph N';

  document.querySelector('#weather-alerts .font-semibold').textContent = 'No active weather alerts';
  document.querySelector('#weather-alerts .text-gray-500').textContent = 'All clear for now. Stay tuned for updates.';

  // Update 7-day forecast (demo)
  document.querySelector('#weather-forecast .divide-y').innerHTML = `
    <div class="grid grid-cols-4 items-center py-3">
      <p class="font-medium text-gray-700">Tue</p>
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-yellow-500">sunny</span>
        <p class="text-gray-600">Sunny</p>
      </div>
      <p class="text-gray-600 text-center">74°</p>
      <p class="text-gray-600 text-right">10%</p>
    </div>
    <div class="grid grid-cols-4 items-center py-3">
      <p class="font-medium text-gray-700">Wed</p>
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-gray-400">cloud</span>
        <p class="text-gray-600">Cloudy</p>
      </div>
      <p class="text-gray-600 text-center">69°</p>
      <p class="text-gray-600 text-right">20%</p>
    </div>
    <!-- Add more days as needed -->`;

  // For real implementation, fetch:
  // 1. Current conditions: https://api.weather.gov/points/{lat},{lng}
  // 2. Alerts: https://api.weather.gov/alerts/active?point={lat},{lng}
  // 3. Forecast: https://api.weather.gov/gridpoints/{office}/{grid X},{grid Y}/forecast
  // See: https://www.weather.gov/documentation/services-web-api
}

// Keyboard and mouse event listeners
if (searchInput && suggestionsBox) {
  loadLocations();

  searchInput.addEventListener('input', (e) => {
    showSuggestions(e.target.value);
  });

  searchInput.addEventListener('blur', (e) => {
    setTimeout(() => { suggestionsBox.classList.add('hidden'); }, 100); // Hide dropdown after click
    enforceSelection(e);
  });

  suggestionsBox.addEventListener('mousedown', onSuggestionClick);

  // Prevent form submission on Enter, select if only one suggestion
  searchInput.addEventListener('keydown', (e) => {
    const items = suggestionsBox.querySelectorAll('li');
    if (e.key === 'Enter' && items.length === 1) {
      items[0].click();
      e.preventDefault();
    }
  });
}