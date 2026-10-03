import { Fragment, useState } from 'react';
import '../styles/components/PermissionMatrix.css';

type Permission = { key: string; label: string; group?: string; globalOnly?: boolean };
type Server = { id: string | number; name: string };
type PermissionState = { checked: boolean; disabled?: boolean; unavailable?: boolean };

export default function PermissionMatrix({ permissions, servers, getState, onToggle }: {
  permissions: Permission[];
  servers: Server[];
  getState: (permission: Permission, scope: string) => PermissionState;
  onToggle: (permission: Permission, scope: string, checked: boolean) => void;
}) {
  const [scope, setScope] = useState('global');
  const scopes = [{ id: 'global', name: 'Global' }, ...servers.map(server => ({ id: String(server.id), name: server.name }))];
  const selectedScope = scopes.some(item => item.id === scope) ? scope : 'global';
  const groups = permissions.reduce<Record<string, Permission[]>>((result, permission) => {
    (result[permission.group || 'Other'] ||= []).push(permission);
    return result;
  }, {});
  const control = (permission: Permission, currentScope: string) => {
    const state = getState(permission, currentScope);
    return state.unavailable ? <span aria-label="Not available for this scope">—</span> : (
      <input
        type="checkbox"
        aria-label={`${permission.label} for ${scopes.find(item => item.id === currentScope)?.name || currentScope}`}
        checked={state.checked}
        disabled={state.disabled}
        onChange={event => onToggle(permission, currentScope, event.target.checked)}
      />
    );
  };

  return (
    <div className="permission-matrix">
      <div className="permission-scope-picker">
        <label htmlFor="permission-scope">Edit permissions for</label>
        <select id="permission-scope" value={selectedScope} onChange={event => setScope(event.target.value)}>
          {scopes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>
      <div className="permission-checklist">
        {Object.entries(groups).map(([group, entries]) => (
          <section key={group} className="permission-group" aria-label={group}>
            <h5>{group}</h5>
            {entries.map(permission => {
              const state = getState(permission, selectedScope);
              if (state.unavailable) return null;
              return (
                <div key={permission.key} className="permission-check-row">
                  <div className="permission-check-text">
                    <strong>{permission.label}</strong>
                    <code>{permission.key}</code>
                    {state.disabled && <small>Inherited</small>}
                  </div>
                  {control(permission, selectedScope)}
                </div>
              );
            })}
          </section>
        ))}
      </div>
      <div className="permission-table-scroll">
        <table className="permission-table">
          <thead><tr><th scope="col">Permission</th>{scopes.map(item => <th scope="col" key={item.id}>{item.name}</th>)}</tr></thead>
          <tbody>{Object.entries(groups).map(([group, entries]) => (
            <Fragment key={group}>
              <tr className="permission-group-row" key={`${group}-heading`}><th colSpan={scopes.length + 1} scope="rowgroup">{group}</th></tr>
              {entries.map(permission => <tr key={permission.key}>
                <th scope="row"><strong>{permission.label}</strong><code>{permission.key}</code></th>
                {scopes.map(item => <td key={item.id}>{control(permission, item.id)}</td>)}
              </tr>)}
            </Fragment>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
