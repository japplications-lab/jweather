/**
 * Location Search with Auto-suggestion
 * Handles CSV loading, search suggestions, and NWS API integration
 */

class LocationSearch {
    constructor() {
        this.locations = [];
        this.currentSuggestions = [];
        this.selectedIndex = -1;
        this.searchInput = null;
        this.suggestionsContainer = null;
        
        this.init();
    }

    async init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupUI());
        } else {
            this.setupUI();
        }
        
        // Load locations data
        await this.loadLocations();
    }

    setupUI() {
        // Find the search input
        this.searchInput = document.querySelector('input[type="search"]');
        if (!this.searchInput) {
            console.error('Search input not found');
            return;
        }

        // Create suggestions dropdown container
        this.createSuggestionsContainer();
        
        // Bind event listeners
        this.bindEvents();
    }

    createSuggestionsContainer() {
        this.suggestionsContainer = document.createElement('div');
        this.suggestionsContainer.className = 'absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md shadow-lg max-h-64 overflow-y-auto z-50 hidden';
        
        // Insert after the search input's parent container
        const searchContainer = this.searchInput.closest('.relative');
        searchContainer.appendChild(this.suggestionsContainer);
    }

    bindEvents() {
        // Search input events
        this.searchInput.addEventListener('input', (e) => this.handleInput(e));
        this.searchInput.addEventListener('keydown', (e) => this.handleKeydown(e));
        this.searchInput.addEventListener('blur', (e) => this.handleBlur(e));
        this.searchInput.addEventListener('focus', (e) => this.handleFocus(e));

        // Hide suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.relative')) {
                this.hideSuggestions();
            }
        });
    }

    async loadLocations() {
        try {
            const response = await fetch('/elements/files/locations.csv');
            const csvText = await response.text();
            
            // Parse CSV manually
            const lines = csvText.trim().split('\n');
            
            this.locations = lines.slice(1).map((line, lineIndex) => {
                const values = line.split(',');
                
                return {
                    zip: values[0].trim(),
                    lat: parseFloat(values[1]),
                    lng: parseFloat(values[2]),
                    city: values[3].trim(),
                    state: values[4] ? values[4].trim() : 'Unknown',
                    displayText: `${values[3].trim()}, ${values[4] ? values[4].trim() : 'Unknown'} ${values[0].trim()}`
                };
            }).filter(location => !isNaN(location.lat) && !isNaN(location.lng));
            
            console.log(`Loaded ${this.locations.length} locations`);
        } catch (error) {
            console.error('Error loading locations:', error);
        }
    }

    handleInput(e) {
        const query = e.target.value.trim();
        
        if (query.length < 2) {
            this.hideSuggestions();
            return;
        }

        this.showSuggestions(query);
    }

    showSuggestions(query) {
        const queryLower = query.toLowerCase();
        
        // Search for matches in city, state, or zip
        this.currentSuggestions = this.locations.filter(location => {
            if (!location || !location.city || !location.state || !location.zip) {
                return false;
            }
            return location.city.toLowerCase().includes(queryLower) ||
                   location.state.toLowerCase().includes(queryLower) ||
                   location.zip.includes(query);
        }).slice(0, 10); // Limit to 10 suggestions

        if (this.currentSuggestions.length === 0) {
            this.hideSuggestions();
            return;
        }

        this.renderSuggestions();
        this.suggestionsContainer.classList.remove('hidden');
    }

    renderSuggestions() {
        this.suggestionsContainer.innerHTML = '';
        
        this.currentSuggestions.forEach((location, index) => {
            const item = document.createElement('div');
            item.className = 'px-4 py-2 cursor-pointer hover:bg-gray-100 border-b border-gray-100 last:border-b-0';
            item.textContent = location.displayText;
            item.dataset.index = index;
            
            item.addEventListener('click', () => this.selectLocation(location));
            
            this.suggestionsContainer.appendChild(item);
        });
    }

    handleKeydown(e) {
        if (!this.currentSuggestions.length) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.selectedIndex = Math.min(this.selectedIndex + 1, this.currentSuggestions.length - 1);
                this.updateSelection();
                break;
                
            case 'ArrowUp':
                e.preventDefault();
                this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
                this.updateSelection();
                break;
                
            case 'Enter':
                e.preventDefault();
                if (this.selectedIndex >= 0) {
                    this.selectLocation(this.currentSuggestions[this.selectedIndex]);
                }
                break;
                
            case 'Escape':
                this.hideSuggestions();
                break;
        }
    }

    updateSelection() {
        const items = this.suggestionsContainer.querySelectorAll('div');
        items.forEach((item, index) => {
            if (index === this.selectedIndex) {
                item.classList.add('bg-blue-100');
            } else {
                item.classList.remove('bg-blue-100');
            }
        });
    }

    handleBlur(e) {
        // Delay hiding to allow for clicks on suggestions
        setTimeout(() => {
            if (!this.suggestionsContainer.contains(document.activeElement)) {
                this.hideSuggestions();
            }
        }, 200);
    }

    handleFocus(e) {
        if (this.searchInput.value.trim().length >= 2) {
            this.showSuggestions(this.searchInput.value.trim());
        }
    }

    hideSuggestions() {
        this.suggestionsContainer.classList.add('hidden');
        this.currentSuggestions = [];
        this.selectedIndex = -1;
    }

    async selectLocation(location) {
        console.log('Selected location:', location);
        
        // Update search input
        this.searchInput.value = location.displayText;
        this.hideSuggestions();
        
        // Fetch weather data
        await this.fetchWeatherData(location.lat, location.lng, location);
    }

    async fetchWeatherData(lat, lng, location) {
        try {
            // Show loading state
            this.updateWeatherUI(null, 'Loading weather data...', location);
            
            // Get NWS point data first to find the forecast office and grid
            const pointResponse = await fetch(`https://api.weather.gov/points/${lat},${lng}`);
            if (!pointResponse.ok) {
                throw new Error('Failed to get NWS point data');
            }
            
            const pointData = await pointResponse.json();
            
            // Get current conditions and forecast
            const [currentResponse, forecastResponse, alertsResponse] = await Promise.all([
                fetch(pointData.properties.observationStations).then(r => r.json())
                    .then(stations => fetch(stations.features[0].properties.id + '/observations/latest')),
                fetch(pointData.properties.forecast),
                fetch(`https://api.weather.gov/alerts/active?point=${lat},${lng}`)
            ]);

            const [currentData, forecastData, alertsData] = await Promise.all([
                currentResponse.json(),
                forecastResponse.json(),
                alertsResponse.json()
            ]);

            this.updateWeatherUI({
                current: currentData,
                forecast: forecastData,
                alerts: alertsData
            }, null, location);

        } catch (error) {
            console.error('Error fetching weather data:', error);
            this.updateWeatherUI(null, 'Error loading weather data. Please try again.', location);
        }
    }

    updateWeatherUI(weatherData, message, location) {
        // Update location name
        const locationHeader = document.querySelector('h2');
        if (locationHeader && locationHeader.textContent.includes('Current Conditions')) {
            locationHeader.textContent = `${location.city}, ${location.state} - Current Conditions`;
        }

        if (message) {
            // Show loading or error message
            const tempElement = document.querySelector('.text-7xl');
            if (tempElement) {
                tempElement.textContent = '--°F';
            }
            
            const conditionElement = document.querySelector('.text-xl.text-gray-600');
            if (conditionElement) {
                conditionElement.textContent = message;
            }
            return;
        }

        if (!weatherData) return;

        try {
            // Update current conditions
            if (weatherData.current && weatherData.current.properties) {
                const current = weatherData.current.properties;
                
                // Temperature
                const tempElement = document.querySelector('.text-7xl');
                if (tempElement && current.temperature && current.temperature.value) {
                    const tempF = this.celsiusToFahrenheit(current.temperature.value);
                    tempElement.textContent = `${Math.round(tempF)}°F`;
                }
                
                // Conditions
                const conditionElement = document.querySelector('.text-xl.text-gray-600');
                if (conditionElement && current.textDescription) {
                    conditionElement.textContent = current.textDescription;
                }
                
                // Additional details
                const detailsContainer = document.querySelector('.space-y-2.text-gray-500');
                if (detailsContainer && current) {
                    let humidity = current.relativeHumidity ? `${Math.round(current.relativeHumidity.value)}%` : 'N/A';
                    let windSpeed = current.windSpeed ? `${Math.round(this.mpsToMph(current.windSpeed.value))} mph` : 'N/A';
                    let windDirection = current.windDirection ? this.degreesToDirection(current.windDirection.value) : '';
                    
                    detailsContainer.innerHTML = `
                        <p>Humidity: ${humidity}</p>
                        <p>Wind: ${windSpeed} ${windDirection}</p>
                    `;
                }
            }

            // Update alerts
            this.updateAlertsUI(weatherData.alerts);

            // Update forecast
            this.updateForecastUI(weatherData.forecast);

        } catch (error) {
            console.error('Error updating weather UI:', error);
        }
    }

    updateAlertsUI(alertsData) {
        const alertsContainer = document.querySelector('h2').parentElement.nextElementSibling;
        if (!alertsContainer) return;

        const alertContent = alertsContainer.querySelector('.flex.items-center.gap-4');
        if (!alertContent) return;

        if (alertsData && alertsData.features && alertsData.features.length > 0) {
            const alert = alertsData.features[0].properties;
            alertContent.innerHTML = `
                <span class="material-symbols-outlined text-red-500 text-3xl">warning</span>
                <div>
                    <p class="font-semibold text-gray-800">${alert.event}</p>
                    <p class="text-gray-500 text-sm">${alert.headline}</p>
                </div>
            `;
        } else {
            alertContent.innerHTML = `
                <span class="material-symbols-outlined text-green-500 text-3xl">check_circle</span>
                <div>
                    <p class="font-semibold text-gray-800">No active weather alerts</p>
                    <p class="text-gray-500 text-sm">All clear for now. Stay tuned for updates.</p>
                </div>
            `;
        }
    }

    updateForecastUI(forecastData) {
        if (!forecastData || !forecastData.properties || !forecastData.properties.periods) return;

        const forecastContainer = document.querySelector('.divide-y.divide-gray-200');
        if (!forecastContainer) return;

        const periods = forecastData.properties.periods.slice(0, 7); // Get first 7 periods
        
        forecastContainer.innerHTML = periods.map(period => `
            <div class="grid grid-cols-4 items-center py-3">
                <p class="font-medium text-gray-700">${this.formatDayName(period.name)}</p>
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-yellow-500">${this.getWeatherIcon(period.shortForecast)}</span>
                    <p class="text-gray-600">${period.shortForecast}</p>
                </div>
                <p class="text-gray-600 text-center">${period.temperature}°</p>
                <p class="text-gray-600 text-right">--</p>
            </div>
        `).join('');
    }

    // Utility functions
    celsiusToFahrenheit(celsius) {
        return (celsius * 9/5) + 32;
    }

    mpsToMph(mps) {
        return mps * 2.237;
    }

    degreesToDirection(degrees) {
        const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        return directions[Math.round(degrees / 22.5) % 16];
    }

    formatDayName(name) {
        // Convert "This Afternoon" to "Today", "Tonight" to "Today", etc.
        if (name.includes('This') || name.includes('Tonight')) return 'Today';
        return name.substring(0, 3);
    }

    getWeatherIcon(condition) {
        const conditionLower = condition.toLowerCase();
        if (conditionLower.includes('sunny') || conditionLower.includes('clear')) return 'wb_sunny';
        if (conditionLower.includes('cloudy') || conditionLower.includes('overcast')) return 'cloud';
        if (conditionLower.includes('rain') || conditionLower.includes('shower')) return 'rainy';
        if (conditionLower.includes('snow')) return 'ac_unit';
        if (conditionLower.includes('storm') || conditionLower.includes('thunder')) return 'thunderstorm';
        return 'wb_cloudy';
    }
}

// Initialize when the page loads
window.locationSearchInstance = new LocationSearch();