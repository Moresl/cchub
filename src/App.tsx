import { BrowserRouter, Routes, Route } from "react-router-dom";
import Sidebar from "./components/layout/Sidebar";
import Header from "./components/layout/Header";
import Dashboard from "./pages/Dashboard";
import McpServers from "./pages/McpServers";
import McpClients from "./pages/McpClients";
import Logs from "./pages/Logs";
import Skills from "./pages/Skills";
import Hooks from "./pages/Hooks";
import Settings from "./pages/Settings";
import Security from "./pages/Security";
import Marketplace from "./pages/Marketplace";
import Workspaces from "./pages/Workspaces";
import Profiles from "./pages/Profiles";
import { ToastContainer } from "./components/Toast";

function App() {
  return (
    <BrowserRouter>
      <ToastContainer />
      <div className="app-layout">
        <Sidebar />
        <div className="main-area">
          <Header />
          <main className="page-content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/mcp-servers" element={<McpServers />} />
              <Route path="/mcp-clients" element={<McpClients />} />
              <Route path="/logs" element={<Logs />} />
              <Route path="/skills" element={<Skills />} />
              <Route path="/marketplace" element={<Marketplace />} />
              <Route path="/hooks" element={<Hooks />} />
              <Route path="/workspaces" element={<Workspaces />} />
              <Route path="/profiles" element={<Profiles />} />
              <Route path="/security" element={<Security />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
