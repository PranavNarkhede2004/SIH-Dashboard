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

// --- NEW: Legend Component ---
const Legend = ({ map, maxAbundance }) => {
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
            '<i style="background:' +
            getColor(from + 1, maxAbundance) +
            '"></i> ' +
            from + (to ? '&ndash;' + to : '+')
          );
        }
        div.innerHTML = labels.join('<br>');
        return div;
      };
      legend.addTo(map);

      // Cleanup function to remove the legend when the component unmounts
      return () => {
        if (legend._map) {
          legend.remove();
        }
      };
    }
  }, [map, maxAbundance]);
  return null;
};


const Dashboard = () => {
  const [map, setMap] = useState(null);
  const [filteredData, setFilteredData] = useState([]);
  const [speciesFilter, setSpeciesFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("");
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showMarkers, setShowMarkers] = useState(true);

  // Calculate unique species, date range, and max abundance from the data
  const { uniqueSpecies, dateRange, maxAbundance } = useMemo(() => {
    if (!fisheriesData || !fisheriesData.features || fisheriesData.features.length === 0) {
      return { uniqueSpecies: ["All"], dateRange: { min: '', max: '' }, maxAbundance: 0 };
    }
    
    const featuresWithValidDates = fisheriesData.features.filter(
      f => f.properties.date && !isNaN(new Date(f.properties.date))
    );

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
      dateRange: { 
        min: minDate.toISOString().split('T')[0], 
        max: maxDate.toISOString().split('T')[0] 
      },
      maxAbundance: Math.max(0, ...abundances)
    };
  }, []);

  // Set the initial date filter once
  useEffect(() => {
    if (dateRange.max) {
      setDateFilter(dateRange.max);
    }
  }, [dateRange]);

  // Filter data based on user selections
  useEffect(() => {
    const filtered = fisheriesData.features.filter(feature => {
      const { properties } = feature;
      const speciesMatch = speciesFilter === "All" || properties.species === speciesFilter;
      const dateIsValid = properties.date && !isNaN(new Date(properties.date));
      const dateMatch = dateFilter && dateIsValid ? new Date(properties.date) <= new Date(dateFilter) : true;
      return speciesMatch && dateMatch;
    });
    setFilteredData(filtered);
  }, [speciesFilter, dateFilter]);

  // Auto-zoom to fit all data
  useEffect(() => {
    if (!map || !fisheriesData.features || fisheriesData.features.length === 0) return;
    const latLngs = fisheriesData.features.map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0]]);
    const bounds = L.latLngBounds(latLngs);
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map]);

  // Update heatmap when data changes
  useEffect(() => {
    if (!map) return;
    map.eachLayer(layer => { if (layer instanceof L.HeatLayer) map.removeLayer(layer); });
    if (showHeatmap && filteredData.length > 0) {
      const points = filteredData.map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0], f.properties.abundance]);
      L.heatLayer(points, { radius: 25, blur: 15, maxZoom: 12 }).addTo(map);
    }
  }, [filteredData, map, showHeatmap]);
  
  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    const totalSightings = filteredData.length;
    if (totalSightings === 0) return { totalSightings: 0, avgAbundance: 0 };
    const totalAbundance = filteredData.reduce((sum, f) => sum + (f.properties.abundance || 1), 0);
    const avgAbundance = (totalAbundance / totalSightings).toFixed(2);
    return { totalSightings, avgAbundance };
  }, [filteredData]);

  return (
    <div className="dashboard-container">
      {/* Sidebar remains the same */}
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
      </div>
      
      {/* Map Container */}
      <MapContainer center={[15.0, 78.0]} zoom={5} scrollWheelZoom={true} className="map-view" whenCreated={setMap}>
        {/* Style tag to avoid changing the CSS file */}
        <style>
          {`
            .legend {
              padding: 6px 8px;
              font: 14px Arial, Helvetica, sans-serif;
              background: white;
              background: rgba(255, 255, 255, 0.8);
              box-shadow: 0 0 15px rgba(0, 0, 0, 0.2);
              border-radius: 5px;
              line-height: 18px;
              color: #555;
            }
            .legend i {
              width: 18px;
              height: 18px;
              float: left;
              margin-right: 8px;
              opacity: 0.7;
            }
          `}
        </style>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <GeoJSON data={eezBoundary} style={() => ({ color: "#007bff", weight: 2, fillOpacity: 0.1 })} />
        <Legend map={map} maxAbundance={maxAbundance} />

        {/* --- Render colored CircleMarkers instead of default Markers --- */}
        {showMarkers && filteredData.map((feature, index) => {
          const { species, abundance, date } = feature.properties;
          const [lng, lat] = feature.geometry.coordinates;
          const pathOptions = {
            color: getColor(abundance, maxAbundance),
            fillColor: getColor(abundance, maxAbundance),
            fillOpacity: 0.7,
            radius: 5 + (abundance / maxAbundance) * 10 // Size also varies with abundance
          };
          
          return (
            <CircleMarker 
              key={index} 
              center={[lat, lng]} 
              pathOptions={pathOptions}
              eventHandlers={{
                click: () => {
                  if (map) map.flyTo([lat, lng], 10);
                },
              }}
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
