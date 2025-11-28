<p align="center">
  <img src="Docs/logo.png" width="130">
</p>

<h1 align="center" style="color:#002B5B;">
  Intelligent Maritime System (IMS)
</h1>

<p align="center">
Real-Time AIS and Weather Fusion with Transformer-Based Maritime Risk Forecasting
</p>

<br>

---

<h2 style="color:#002B5B;">Maritime Map</h2>

<p align="center">
  <img src="Docs/map-demo.png" width="92%">
</p>

The IMS dashboard provides real-time AIS vessel positioning combined with high-resolution weather data through a MapLibre-based interface. The system supports situational awareness by integrating dynamic vessel movements and short-range environmental conditions.

---

<h2 style="color:#002B5B;">System Architecture</h2>

<p align="center">
  <img src="Docs/architecture.png" width="92%">
</p>

The architecture integrates AIS ingestion, weather retrieval, and Transformer-based risk inference into a unified maritime intelligence platform optimized for operational environments.

---

<h2 style="color:#002B5B;">Data Sources</h2>

IMS relies on two primary external data providers:

<b style="color:#005F99;">AIS Data Stream</b>  
Real-time AIS messages are obtained from AISstream, which provides continuous vessel positions, movement updates, and navigational status.  
Official source:  
https://aisstream.io

<b style="color:#005F99;">Weather Data</b>  
High-frequency weather data, including wind speed, gusts, temperature, and precipitation, is retrieved from Open-Meteo.  
Official source:  
https://open-meteo.com

These two real-time data providers supply the contextual AIS–weather windows used for risk estimation and short-term hazard prediction.

---

<h2 style="color:#002B5B;">Demonstration Video</h2>

A complete demonstration of the system is available here:  
[View the demo video](https://vimeo.com/1141329439?share=copy&fl=sv&fe=ci)

---

<h2 style="color:#002B5B;">System Summary</h2>

- AIS Integration: Real-time positional data from AISstream  
- Weather Integration: High-resolution forecasts from Open-Meteo  
- Frontend: MapLibre dashboard for AIS and weather fusion  
- Backend: REST APIs and orchestration services  
- Risk Model: Transformer-based microservice for short-term hazard prediction  
- Data Fusion: Combined AIS–weather inputs for multi-factor risk scoring
