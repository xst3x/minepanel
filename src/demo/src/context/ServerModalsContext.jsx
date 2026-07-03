import { createContext, useContext, useState } from 'react';

const ServerModalsContext = createContext(null);

export function ServerModalsProvider({ children }) {
  const [modal, setModal] = useState(null); // null | 'create' | 'import'

  const openCreate = () => setModal('create');
  const openImport = () => setModal('import');
  const close = () => setModal(null);

  return (
    <ServerModalsContext.Provider value={{ modal, openCreate, openImport, close }}>
      {children}
    </ServerModalsContext.Provider>
  );
}

export function useServerModals() {
  return useContext(ServerModalsContext);
}
