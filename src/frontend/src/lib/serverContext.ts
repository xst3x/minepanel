export interface ServerContext {
  serverId: string; serverInfo: any; status: string;
  metrics: { cpu: number; ram: number; maxRam: number; players: number; maxPlayers: number; temp: string; tps: number | null; startedAt: number | null; uptime: number; timezone: string | null };
  consoleLines: string[]; permissions: string[]; isAdmin: boolean;
  hasPerm: (permission: string) => boolean;
  sendConsoleCommand: (command: string) => void;
  sendChatMessage: (message: string) => void;
  clearConsoleLines: () => void;
  reloadServerInfo: () => Promise<void>;
}
