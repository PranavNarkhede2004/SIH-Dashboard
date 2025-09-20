import React, { useState, useEffect, useMemo } from "react";
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";
import { fisheriesData, eezBoundary } from "./mockdata";
import "./Dashboard.css";

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
      return <div className="chart-container"><p>No data to display in chart.</p></div>;
    }
  
    const maxCount = topSpecies[0][1];
  
    return (
      <div className="chart-container">
        <h4>Top 10 Species</h4>
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
  // --- FIX: Create separate state for the map and the chart ---
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

  // --- FIX: This effect updates the data for BOTH the map and the chart when the date changes ---
  useEffect(() => {
    const filteredByDate = fisheriesData.features.filter(feature => {
      const { properties } = feature;
      const dateIsValid = properties.date && !isNaN(new Date(properties.date));
      const dateMatch = dateFilter && dateIsValid ? new Date(properties.date) <= new Date(dateFilter) : true;
      return dateMatch;
    });
    setChartData(filteredByDate); // The chart always shows data filtered by date
    setMapData(filteredByDate); // The map starts with the same data
  }, [dateFilter]);


  // --- FIX: This effect ONLY updates the map when the species filter changes ---
  useEffect(() => {
    if (speciesFilter === 'All') {
      setMapData(chartData); // If "All" is selected, map shows everything from the chart
    } else {
      const filteredBySpecies = chartData.filter(feature => feature.properties.species === speciesFilter);
      setMapData(filteredBySpecies); // Otherwise, filter the map by the selected species
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
    if (showHeatmap && mapData.length > 0) { // <-- Uses mapData
      const points = mapData.map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0], f.properties.abundance]);
      L.heatLayer(points, { 
        radius: 25, 
        blur: 15, 
        maxZoom: 12,
        gradient: {0.2: '#91cf60', 0.4: '#d9ef8b', 0.6: '#fee08b', 0.8: '#fc8d59', 1.0: '#d73027'}
      }).addTo(map);
    }
  }, [mapData, map, showHeatmap]); // <-- Now depends on mapData
  
  const summaryStats = useMemo(() => {
    const totalSightings = mapData.length; // <-- Uses mapData
    if (totalSightings === 0) return { totalSightings: 0, avgAbundance: 0 };
    const totalAbundance = mapData.reduce((sum, f) => sum + (f.properties.abundance || 1), 0);
    const avgAbundance = (totalAbundance / totalSightings).toFixed(2);
    return { totalSightings, avgAbundance };
  }, [mapData]); // <-- Now depends on mapData

  return (
    <div className="dashboard-container">
      <div className="sidebar">
        <h2>Fisheries Dashboard</h2>
        <hr />
        <div className="stats-container">
          <h4>Filtered Results</h4>
          <div className="stat-item"><span>Total Sightings</span><strong>{summaryStats.totalSightings}</strong></div>
          <div className="stat-item"><span>Avg. Abundance (kg/haul)</span><strong>{summaryStats.avgAbundance}</strong></div>
        </div>
        <hr />
        <h4>Filters & Layers</h4>
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
          <div className="checkbox-group"><input type="checkbox" id="heatmap-toggle" checked={showHeatmap} onChange={() => setShowHeatmap(!showHeatmap)} /><label htmlFor="heatmap-toggle">Show Abundance Heatmap</label></div>
          <div className="checkbox-group"><input type="checkbox" id="markers-toggle" checked={showMarkers} onChange={() => setShowMarkers(!showMarkers)} /><label htmlFor="markers-toggle">Show Survey Points</label></div>
        </div>
        <hr />
        {/* --- The chart now gets data filtered only by date --- */}
        <SpeciesBarChart data={chartData} onBarClick={setSpeciesFilter} />
      </div>
      
      <MapContainer center={[15.0, 78.0]} zoom={5} scrollWheelZoom={true} className="map-view" whenCreated={setMap}>
        <style>
          {`
            .legend { padding: 6px 8px; font: 14px Arial, Helvetica, sans-serif; background: rgba(255, 255, 255, 0.8); box-shadow: 0 0 15px rgba(0, 0, 0, 0.2); border-radius: 5px; line-height: 18px; color: #555; }
            .legend i { width: 18px; height: 18px; float: left; margin-right: 8px; opacity: 0.7; }
            .heatmap-legend .gradient-bar { height: 10px; margin-top: 5px; margin-bottom: 5px; background: linear-gradient(to right, #91cf60, #d9ef8b, #fee08b, #fc8d59, #d73027); }
            
            .chart-container { margin-top: 20px; }
            .chart-container h4 { margin-top: 0; color: #495057; border-bottom: 1px solid #ced4da; padding-bottom: 5px; }
            .bar-row { display: flex; align-items: center; margin-bottom: 5px; cursor: pointer; }
            .bar-row:hover .bar-label { color: #007bff; }
            .bar-label { font-size: 12px; width: 120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0; margin-right: 5px; }
            .bar-wrapper { flex-grow: 1; background-color: #e9ecef; border-radius: 3px; }
            .bar { background-color: #007bff; height: 20px; border-radius: 3px; color: white; font-size: 12px; line-height: 20px; padding-left: 5px; transition: width 0.3s ease-in-out; }
          `}
        </style>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <GeoJSON data={eezBoundary} style={() => ({ color: "#007bff", weight: 2, fillOpacity: 0.1 })} />
        
        {showMarkers && <CircleLegend map={map} maxAbundance={maxAbundance} />}
        {showHeatmap && <HeatmapLegend map={map} />}

        {showMarkers && mapData.map((feature, index) => { // <-- Renders mapData
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

