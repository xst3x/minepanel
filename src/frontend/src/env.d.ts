/// <reference types="vite/client" />
interface Window {
  serverIconHelper?: {
    invalidateIconCache: (id: string) => void;
    fetchIconUrl: (id: string) => Promise<string>;
    [key: string]: any;
  };
  players?: { assetsMapper?: any };
}
