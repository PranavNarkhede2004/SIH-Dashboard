import React, { useState, useEffect, useMemo } from "react";
import { MapContainer, TileLayer, GeoJSON, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";
import { fisheriesData, eezBoundary } from "./mockdata";
import "./Dashboard.css";

// Fix for default marker icon issue with webpack
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

const Dashboard = () => {
  const [map, setMap] = useState(null);
  const [filteredData, setFilteredData] = useState([]);
  const [speciesFilter, setSpeciesFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState(""); // <-- Start with an empty string
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);

  // Step 1: Calculate constants from the data. This is a pure calculation, perfect for useMemo.
 
// src/Dashboard.js

  // Replace the existing useMemo block with this corrected version
  const { uniqueSpecies, dateRange } = useMemo(() => {
    if (!fisheriesData || !fisheriesData.features || fisheriesData.features.length === 0) {
      return { uniqueSpecies: ["All"], dateRange: { min: '', max: '' } };
    }
    
    // First, filter out any features that have a bad or missing date
    const featuresWithValidDates = fisheriesData.features.filter(
      f => f.properties.date && !isNaN(new Date(f.properties.date))
    );

    // If no data remains after filtering, return a default value to prevent a crash
    if (featuresWithValidDates.length === 0) {
      return { 
        uniqueSpecies: ["All", ...new Set(fisheriesData.features.map(f => f.properties.species))], 
        dateRange: { min: '', max: '' } 
      };
    }

    const species = ["All", ...new Set(fisheriesData.features.map(f => f.properties.species))];
    // Now, perform calculations only on the clean data
    const dates = featuresWithValidDates.map(f => new Date(f.properties.date));
    const minDate = new Date(Math.min.apply(null, dates));
    const maxDate = new Date(Math.max.apply(null, dates));
    
    return { 
      uniqueSpecies: species, 
      dateRange: { 
        min: minDate.toISOString().split('T')[0], 
        max: maxDate.toISOString().split('T')[0] 
      } 
    };
  }, []);
  

  // Step 2: Set the initial date filter once the component mounts and dateRange is calculated.
  useEffect(() => {
    if (dateRange.max) {
      setDateFilter(dateRange.max);
    }
  }, [dateRange.max]);


  // Step 3: Filter the data whenever the filters change. This logic remains the same.
  useEffect(() => {
    if (!fisheriesData || !fisheriesData.features) return;

    const filtered = fisheriesData.features.filter(feature => {
      const speciesMatch = speciesFilter === "All" || feature.properties.species === speciesFilter;
      const dateMatch = dateFilter ? new Date(feature.properties.date) <= new Date(dateFilter) : true;
      return speciesMatch && dateMatch;
    });
    setFilteredData(filtered);
  }, [speciesFilter, dateFilter]);

  // The rest of the component remains the same...
  useEffect(() => {
    if (!map || !fisheriesData.features || fisheriesData.features.length === 0) return;
    const latLngs = fisheriesData.features.map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0]]);
    const bounds = L.latLngBounds(latLngs);
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map]);

  useEffect(() => {
    if (!map) return;
    map.eachLayer(layer => { if (layer instanceof L.HeatLayer) map.removeLayer(layer); });
    if (showHeatmap && filteredData.length > 0) {
      const points = filteredData.map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0], f.properties.abundance / 100]);
      L.heatLayer(points, { radius: 25, maxZoom: 10 }).addTo(map);
    }
  }, [filteredData, map, showHeatmap]);
  
  const summaryStats = useMemo(() => {
    const totalSightings = filteredData.length;
    if (totalSightings === 0) return { totalSightings: 0, avgAbundance: 0 };
    const totalAbundance = filteredData.reduce((sum, f) => sum + (f.properties.abundance || 1), 0);
    const avgAbundance = (totalAbundance / totalSightings).toFixed(2);
    return { totalSightings, avgAbundance };
  }, [filteredData]);

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
      </div>
      <MapContainer center={[15.0, 78.0]} zoom={5} scrollWheelZoom={true} className="map-view" whenCreated={setMap}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <GeoJSON data={eezBoundary} style={() => ({ color: "#007bff", weight: 2, fillOpacity: 0.1 })} />
        {showMarkers && filteredData.map((feature, index) => {
          const [lng, lat] = feature.geometry.coordinates;
          const { species, abundance, date } = feature.properties;
          return (
            <Marker key={`${species}-${index}`} position={[lat, lng]}>
              <Popup><b>Species:</b> {species}<br/><b>Abundance:</b> {abundance} kg/haul<br/><b>Date:</b> {date}</Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default Dashboard;