import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Resources from "./pages/Resources";
import Changes from "./pages/Changes";
import Settings from "./pages/Settings";
import NetworkAnalysis from "./pages/NetworkAnalysis";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="resources" element={<Resources />} />
          <Route path="changes" element={<Changes />} />
          <Route path="network" element={<NetworkAnalysis />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
