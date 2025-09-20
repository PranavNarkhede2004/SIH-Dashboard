import React, { useState, useEffect, useMemo } from "react";
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";
import { fisheriesData, eezBoundary } from "./mockdata";
// We will embed the CSS directly, so this import is no longer needed.
// import "./Dashboard.css";

// Fix for default marker icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

// Helper function to get color based on density (abundance)
const getColor = (abundance, maxAbundance) => {
  if (maxAbundance === 0) return '#91cf60'; // Default green if no abundance
  const value = abundance / maxAbundance;
  if (value > 0.8) return '#d73027'; // Red
  if (value > 0.6) return '#fc8d59'; // Orange
  if (value > 0.4) return '#fee08b'; // Yellow
  if (value > 0.2) return '#d9ef8b'; // Light Green
  return '#91cf60';              // Green
};

// --- Legend for Circle Markers ---
const CircleLegend = ({ map, maxAbundance }) => {
  useEffect(() => {
    if (map) {
      const legend = L.control({ position: "bottomright" });
      legend.onAdd = () => {
        const div = L.DomUtil.create("div", "info legend");
        const grades = [0, 0.2, 0.4, 0.6, 0.8].map(g => Math.round(g * maxAbundance));
        let labels = ['<strong>Abundance</strong>'];
        for (let i = 0; i < grades.length; i++) {
          const from = grades[i];
          const to = grades[i + 1];
          labels.push(
            '<i style="background:' + getColor(from + 1, maxAbundance) + '"></i> ' +
            from + (to ? '&ndash;' + to : '+')
          );
        }
        div.innerHTML = labels.join('<br>');
        return div;
      };
      legend.addTo(map);
      return () => { if (legend._map) legend.remove(); };
    }
  }, [map, maxAbundance]);
  return null;
};

// --- Legend for Heatmap ---
const HeatmapLegend = ({ map }) => {
  useEffect(() => {
    if (map) {
      const legend = L.control({ position: 'bottomright' });
      legend.onAdd = function () {
        const div = L.DomUtil.create('div', 'info legend heatmap-legend');
        div.innerHTML =
          '<strong>Density</strong><br>' +
          '<div class="gradient-bar"></div>' +
          '<div><span>Low</span><span style="float:right">High</span></div>';
        return div;
      };
      legend.addTo(map);
      return () => { if (legend._map) legend.remove(); };
    }
  }, [map]);
  return null;
};

// --- Interactive Bar Chart Component ---
const SpeciesBarChart = ({ data, onBarClick }) => {
    const topSpecies = useMemo(() => {
      if (!data || data.length === 0) return [];
  
      const counts = data.reduce((acc, feature) => {
        const species = feature.properties.species;
        acc[species] = (acc[species] || 0) + 1;
        return acc;
      }, {});
  
      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    }, [data]);
  
    if (topSpecies.length === 0) {
      return <div className="chart-container"><p style={{color: '#d0d0d0'}}>No data to display in chart.</p></div>;
    }
  
    const maxCount = topSpecies[0][1];
  
    return (
      <div className="chart-container">
        <h4 className="sidebar-subtitle">Top Species</h4>
        {topSpecies.map(([species, count]) => (
          <div key={species} className="bar-row" onClick={() => onBarClick(species)}>
            <div className="bar-label" title={species}>{species}</div>
            <div className="bar-wrapper">
              <div 
                className="bar" 
                style={{ width: `${(count / maxCount) * 100}%` }}
              >
                <span>{count}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
};


const Dashboard = () => {
  const [map, setMap] = useState(null);
  const [mapData, setMapData] = useState([]);
  const [chartData, setChartData] = useState([]);
  
  const [speciesFilter, setSpeciesFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("");
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showMarkers, setShowMarkers] = useState(false);

  const { uniqueSpecies, dateRange, maxAbundance } = useMemo(() => {
    if (!fisheriesData || !fisheriesData.features || fisheriesData.features.length === 0) {
      return { uniqueSpecies: ["All"], dateRange: { min: '', max: '' }, maxAbundance: 0 };
    }
    const featuresWithValidDates = fisheriesData.features.filter(f => f.properties.date && !isNaN(new Date(f.properties.date)));
    if (featuresWithValidDates.length === 0) {
      return { 
        uniqueSpecies: ["All", ...new Set(fisheriesData.features.map(f => f.properties.species))], 
        dateRange: { min: '', max: '' },
        maxAbundance: Math.max(0, ...fisheriesData.features.map(f => f.properties.abundance || 0))
      };
    }
    const species = ["All", ...new Set(fisheriesData.features.map(f => f.properties.species))];
    const dates = featuresWithValidDates.map(f => new Date(f.properties.date));
    const abundances = fisheriesData.features.map(f => f.properties.abundance || 0);
    const minDate = new Date(Math.min.apply(null, dates));
    const maxDate = new Date(Math.max.apply(null, dates));
    return { 
      uniqueSpecies: species, 
      dateRange: { min: minDate.toISOString().split('T')[0], max: maxDate.toISOString().split('T')[0] },
      maxAbundance: Math.max(0, ...abundances)
    };
  }, []);

  useEffect(() => {
    if (dateRange.max) setDateFilter(dateRange.max);
  }, [dateRange]);

  useEffect(() => {
    const filteredByDate = fisheriesData.features.filter(feature => {
      const { properties } = feature;
      const dateIsValid = properties.date && !isNaN(new Date(properties.date));
      const dateMatch = dateFilter && dateIsValid ? new Date(properties.date) <= new Date(dateFilter) : true;
      return dateMatch;
    });
    setChartData(filteredByDate); 
  }, [dateFilter]);


  useEffect(() => {
    if (speciesFilter === 'All') {
        setMapData(chartData);
    } else {
      const filteredBySpecies = chartData.filter(feature => feature.properties.species === speciesFilter);
      setMapData(filteredBySpecies);
    }
  }, [speciesFilter, chartData]);

  useEffect(() => {
    if (!map || !fisheriesData.features || fisheriesData.features.length === 0) return;
    const latLngs = fisheriesData.features.map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0]]);
    const bounds = L.latLngBounds(latLngs);
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50] });
  }, [map]);

  useEffect(() => {
    if (!map) return;
    map.eachLayer(layer => { if (layer instanceof L.HeatLayer) map.removeLayer(layer); });
    if (showHeatmap && mapData.length > 0) {
      const points = mapData.map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0], f.properties.abundance]);
      L.heatLayer(points, { 
        radius: 25, 
        blur: 15, 
        maxZoom: 12,
        gradient: {0.2: '#91cf60', 0.4: '#d9ef8b', 0.6: '#fee08b', 0.8: '#fc8d59', 1.0: '#d73027'}
      }).addTo(map);
    }
  }, [mapData, map, showHeatmap]); 
  
  const summaryStats = useMemo(() => {
    const totalSightings = mapData.length;
    if (totalSightings === 0) return { totalSightings: 0, avgAbundance: 0 };
    const totalAbundance = mapData.reduce((sum, f) => sum + (f.properties.abundance || 1), 0);
    const avgAbundance = (totalAbundance / totalSightings).toFixed(2);
    return { totalSightings, avgAbundance };
  }, [mapData]);

  return (
    <div className="dashboard-container">
      <style>
        {`
          /* --- Global Styles --- */
          .dashboard-container { display: flex; height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
          .map-view { flex-grow: 1; height: 100%; }

          /* --- Vibrant & Natural Sidebar Styles --- */
          .sidebar {
              width: 350px;
              background: linear-gradient(175deg, #13547a, #80d0c7); /* Teal/Aqua Gradient */
              color: #ffffff;
              display: flex;
              flex-direction: column;
              padding: 20px;
              gap: 20px;
              box-shadow: 3px 0 15px rgba(0,0,0,0.2);
              overflow-y: auto;
          }
          .sidebar-header {
              display: flex;
              align-items: center;
              gap: 12px;
              padding-bottom: 15px;
              border-bottom: 1px solid rgba(255, 255, 255, 0.2);
          }
          .sidebar-header h1 {
              font-size: 1.3em;
              margin: 0;
              font-weight: 500;
          }
          .sidebar-header svg {
              stroke: #ffffff;
              width: 28px;
              height: 28px;
          }
          .stats-container {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 15px;
          }
          .stat-card {
              background: rgba(255, 255, 255, 0.1);
              border-radius: 10px;
              padding: 15px;
              display: flex;
              align-items: center;
              gap: 12px;
              border: 1px solid rgba(255, 255, 255, 0.2);
          }
          .stat-icon {
              padding: 10px;
              border-radius: 50%;
              background: rgba(255, 255, 255, 0.15);
              display: flex;
              align-items: center;
              justify-content: center;
          }
          .stat-icon svg { stroke: #ffffff; }
          .stat-info { display: flex; flex-direction: column; }
          .stat-title { font-size: 0.85em; opacity: 0.8; }
          .stat-value { font-size: 1.5em; font-weight: bold; }

          .filter-section {
              background: rgba(255, 255, 255, 0.1);
              border-radius: 10px;
              padding: 20px;
              border: 1px solid rgba(255, 255, 255, 0.2);
          }
          .sidebar-subtitle {
              margin-top: 0;
              margin-bottom: 15px;
              font-size: 1.1em;
              font-weight: 500;
              color: #ffffff;
          }
          .filter-group { margin-bottom: 15px; }
          .filter-group:last-child { margin-bottom: 0; }
          .filter-group label { margin-bottom: 8px; font-size: 0.9em; opacity: 0.8; }
          .filter-group select, .filter-group input[type="date"] {
              width: 100%;
              padding: 10px;
              border-radius: 5px;
              border: 1px solid rgba(255, 255, 255, 0.3);
              background-color: rgba(0, 0, 0, 0.2);
              color: #0d0606ff;
              font-family: inherit;
              -webkit-calendar-picker-indicator { filter: invert(1); }
          }
          .toggle-group { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; }
          .toggle-group span { font-size: 1em; }

          /* Modern Toggle Switch CSS */
          .switch { position: relative; display: inline-block; width: 44px; height: 24px; }
          .switch input { opacity: 0; width: 0; height: 0; }
          .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(0,0,0,0.3); transition: .4s; }
          .slider.round { border-radius: 24px; }
          .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
          input:checked + .slider { background-color: #80d0c7; } /* Teal accent */
          input:checked + .slider:before { background-color: #13547a; transform: translateX(20px); } /* Darker teal */

          /* --- Legend & Map Styles --- */
          .legend { padding: 6px 8px; font: 14px Arial, Helvetica, sans-serif; background: rgba(255, 255, 255, 0.85); box-shadow: 0 0 15px rgba(0, 0, 0, 0.2); border-radius: 5px; line-height: 18px; color: #555; }
          .legend i { width: 18px; height: 18px; float: left; margin-right: 8px; opacity: 0.9; border-radius: 50%;}
          .heatmap-legend .gradient-bar { height: 10px; margin-top: 5px; margin-bottom: 5px; background: linear-gradient(to right, #91cf60, #d9ef8b, #fee08b, #fc8d59, #d73027); border-radius: 5px; }
          
          /* --- Vibrant Chart Styles --- */
          .chart-container { 
              background: rgba(255, 255, 255, 0.1);
              border-radius: 10px;
              padding: 20px;
              border: 1px solid rgba(255, 255, 255, 0.2);
          }
          .bar-row { display: flex; align-items: center; margin-bottom: 8px; cursor: pointer; padding: 4px; border-radius: 5px; transition: background-color 0.2s; }
          .bar-row:hover { background-color: rgba(255, 255, 255, 0.15); }
          .bar-label { font-size: 12px; width: 120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0; margin-right: 8px; opacity: 0.8; }
          .bar-row:hover .bar-label { opacity: 1; }
          .bar-wrapper { flex-grow: 1; background-color: rgba(0, 0, 0, 0.2); border-radius: 5px; }
          .bar { background: linear-gradient(to right, #f8dda4, #f5c469); /* Warm Yellow/Gold */ height: 22px; border-radius: 5px; color: #13547a; font-size: 12px; font-weight: bold; line-height: 22px; padding-left: 8px; transition: width 0.3s ease-in-out; }
        `}
      </style>
      <div className="sidebar">
        <div className="sidebar-header">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7.5 16.5s-1.5-1.5-1.5-3 1.5-3 1.5-3"/><path d="M16.5 16.5s1.5-1.5 1.5-3-1.5-3-1.5-3"/><path d="M12 18.5V22"/><path d="M12 2v1.5"/><path d="M8.5 4.5l-1-1"/><path d="M16.5 4.5l1-1"/><path d="M4.5 8.5l-1 1"/><path d="M20.5 8.5l1 1"/><path d="M12 12a4.5 4.5 0 0 0-4.5 4.5c0 2.21 1.5 4 3.5 4h2c2 0 3.5-1.79 3.5-4a4.5 4.5 0 0 0-4.5-4.5Z"/></svg>
          <h1>CMLRE Data Explorer</h1>
        </div>
        
        <div className="stats-container">
            <div className="stat-card">
                <div className="stat-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>
                </div>
                <div className="stat-info">
                    <span className="stat-title">Total Sightings</span>
                    <span className="stat-value">{summaryStats.totalSightings.toLocaleString()}</span>
                </div>
            </div>
            <div className="stat-card">
                 <div className="stat-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
                 </div>
                <div className="stat-info">
                    <span className="stat-title">Avg. Abundance</span>
                    <span className="stat-value">{summaryStats.avgAbundance}</span>
                </div>
            </div>
        </div>

        <div className="filter-section">
          <h4 className="sidebar-subtitle">Filters & Layers</h4>
          <div className="filter-group">
            <label htmlFor="species-select">Species</label>
            <select id="species-select" value={speciesFilter} onChange={e => setSpeciesFilter(e.target.value)}>
              {uniqueSpecies.map(species => (<option key={species} value={species}>{species}</option>))}
            </select>
          </div>
          <div className="filter-group">
            <label htmlFor="date-slider">Data up to: {dateFilter}</label>
            <input type="date" id="date-slider" min={dateRange.min} max={dateRange.max} value={dateFilter} onChange={e => setDateFilter(e.target.value)} />
          </div>
          <div className="filter-group">
            <label>Map Layers</label>
            <div className="toggle-group">
              <span>Heatmap</span>
              <label className="switch">
                <input type="checkbox" checked={showHeatmap} onChange={() => setShowHeatmap(!showHeatmap)} />
                <span className="slider round"></span>
              </label>
            </div>
             <div className="toggle-group">
              <span>Survey Points</span>
              <label className="switch">
                <input type="checkbox" checked={showMarkers} onChange={() => setShowMarkers(!showMarkers)} />
                <span className="slider round"></span>
              </label>
            </div>
          </div>
        </div>

        <SpeciesBarChart data={chartData} onBarClick={setSpeciesFilter} />
      </div>
      
      <MapContainer center={[15.0, 78.0]} zoom={5} scrollWheelZoom={true} className="map-view" whenCreated={setMap}>
        <TileLayer 
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" 
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' 
        />
        <GeoJSON data={eezBoundary} style={() => ({ color: "#00aaff", weight: 2, fillOpacity: 0.1, dashArray: '5, 5' })} />
        
        {showMarkers && <CircleLegend map={map} maxAbundance={maxAbundance} />}
        {showHeatmap && <HeatmapLegend map={map} />}

        {showMarkers && mapData.map((feature, index) => {
          const { species, abundance, date } = feature.properties;
          const [lng, lat] = feature.geometry.coordinates;
          const pathOptions = {
            color: getColor(abundance, maxAbundance),
            fillColor: getColor(abundance, maxAbundance),
            fillOpacity: 0.7,
            radius: 5 + (abundance / maxAbundance) * 10
          };
          return (
            <CircleMarker 
              key={index} 
              center={[lat, lng]} 
              pathOptions={pathOptions}
              eventHandlers={{ click: () => { if (map) map.flyTo([lat, lng], 10); } }}
            >
              <Tooltip>{species}</Tooltip>
              <Popup><b>{species}</b><br/><b>Abundance:</b> {abundance} kg/haul<br/><b>Date:</b> {date}</Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default Dashboard;

