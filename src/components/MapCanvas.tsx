"use client";
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export default function MarineMap() {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return;

    const map = L.map(mapRef.current, {
      center: [21.5, 39.2],
      zoom: 7,
      zoomControl: false,
      minZoom: 3,
      worldCopyJump: true,
    });
    leafletRef.current = map;

    const esriOcean = L.tileLayer(
      "https://services.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
      {
        attribution:
          'Tiles &copy; <a href="https://www.esri.com">Esri</a> — World Ocean Basemap',
        maxZoom: 13,
      }
    ).addTo(map);

    const seamarks = L.tileLayer(
      "https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png",
      {
        attribution:
          '&copy; <a href="https://www.openseamap.org">OpenSeaMap</a> contributors',
        maxZoom: 18,
        opacity: 0.9,
      }
    ).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control
      .layers(
        { "Esri Ocean": esriOcean },
        { Seamarks: seamarks },
        { position: "topright", collapsed: true }
      )
      .addTo(map);

    const north = L.control({ position: "bottomleft" });
    north.onAdd = () => {
      const div = L.DomUtil.create("div", "north-indicator");
      div.innerHTML = "N";
      return div;
    };
    north.addTo(map);

    return () => {
      map.remove();
      leafletRef.current = null;
    };
  }, []);

  return (
    <div
      ref={mapRef}
      className="w-full h-[70vh] rounded-xl card overflow-hidden relative"
    />
  );
}
