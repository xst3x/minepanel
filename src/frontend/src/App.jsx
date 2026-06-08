import { Routes, Route, Navigate } from 'react-router-dom';
import RequireAuth from './components/RequireAuth.jsx';
import AppLayout from './components/AppLayout.jsx';
import ServerLayout from './components/ServerLayout.jsx';

import Login from './pages/Login.jsx';
import Panel from './pages/Panel.jsx';
import Servers from './pages/Servers.jsx';
import Users from './pages/Users.jsx';
import Ranks from './pages/Ranks.jsx';
import Settings from './pages/Settings.jsx';
import Discord from './pages/Discord.jsx';
import Docs from './pages/Docs.jsx';
import Profile from './pages/Profile.jsx';

import ServerOverview from './pages/server/Overview.jsx';
import ServerConsole from './pages/server/Console.jsx';
import ServerFiles from './pages/server/Files.jsx';
import ServerContent from './pages/server/Content.jsx';
import ServerProperties from './pages/server/Properties.jsx';
import ServerBackups from './pages/server/Backups.jsx';
import ServerLogs from './pages/server/Logs.jsx';
import ServerSettings from './pages/server/Settings.jsx';
import ServerFtp from './pages/server/Ftp.jsx';
import ServerPlayers from './pages/server/Players.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route path="/" element={<Navigate to="/panel" replace />} />
        <Route path="/panel" element={<Panel />} />
        <Route path="/servers" element={<Servers />} />
        <Route path="/users" element={<Users />} />
        <Route path="/ranks" element={<Ranks />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/discord" element={<Discord />} />
        <Route path="/docs" element={<Docs />} />
        <Route path="/profile" element={<Profile />} />

        <Route path="/server/:id" element={<ServerLayout />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<ServerOverview />} />
          <Route path="console" element={<ServerConsole />} />
          <Route path="files" element={<ServerFiles />} />
          <Route path="content" element={<ServerContent />} />
          <Route path="properties" element={<ServerProperties />} />
          <Route path="backups" element={<ServerBackups />} />
          <Route path="logs" element={<ServerLogs />} />
          <Route path="settings" element={<ServerSettings />} />
          <Route path="ftp" element={<ServerFtp />} />
          <Route path="players" element={<ServerPlayers />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/panel" replace />} />
    </Routes>
  );
}
