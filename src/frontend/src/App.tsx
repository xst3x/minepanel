import { Routes, Route, Navigate } from 'react-router-dom';
import RequireAuth from './components/RequireAuth.tsx';
import AppLayout from './components/AppLayout.tsx';
import ServerLayout from './components/ServerLayout.tsx';

import Login from './pages/Login.tsx';
import Panel from './pages/Panel.tsx';
import Servers from './pages/Servers.tsx';
import Users from './pages/Users.tsx';
import Ranks from './pages/Ranks.tsx';
import Settings from './pages/Settings.tsx';
import Discord from './pages/Discord.tsx';
import Docs from './pages/Docs.tsx';
import Profile from './pages/Profile.tsx';

import ServerOverview from './pages/server/Overview.tsx';
import ServerConsole from './pages/server/Console.tsx';
import ServerFiles from './pages/server/Files.tsx';
import ServerContent from './pages/server/Content.tsx';
import ServerProperties from './pages/server/Properties.tsx';
import ServerBackups from './pages/server/Backups.tsx';
import ServerLogs from './pages/server/Logs.tsx';
import ServerSettings from './pages/server/Settings.tsx';
import ServerFtp from './pages/server/Ftp.tsx';
import ServerPlayers from './pages/server/Players.tsx';
import ServerAutomation from './pages/server/Automation.tsx';

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
        <Route path="/docs/:category?/:page?" element={<Docs />} />
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
          <Route path="automation" element={<ServerAutomation />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/panel" replace />} />
    </Routes>
  );
}
