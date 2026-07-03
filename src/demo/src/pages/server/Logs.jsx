import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api.js';
import Select from '../../components/Select.jsx';
import '../../styles/pages/server/Logs.css';

function useIsLight() {
  const [isLight, setIsLight] = useState(
    document.documentElement.getAttribute('data-theme') === 'light'
  );
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsLight(document.documentElement.getAttribute('data-theme') === 'light');
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return isLight;
}

export default function ServerLogs() {
  const { serverId } = useOutletContext();
  const isLight = useIsLight();
  const [logFiles, setLogFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [logContent, setLogContent] = useState('Select a log file to view its contents.');
  const [filterText, setFilterText] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadLogFiles();
  }, [serverId]);

  const loadLogFiles = async () => {
    try {
      const files = await api(`/api/servers/${serverId}/logs`);
      setLogFiles(files || []);
    } catch (err) {
      console.error('Failed to load log files:', err.message);
    }
  };

  const readLog = async (file = selectedFile, page = 1, filter = filterText) => {
    if (!file) return;
    setLoading(true);
    try {
      let url = `/api/servers/${serverId}/logs/read?file=${encodeURIComponent(file)}&page=${page}`;
      if (filter) {
        url += `&filter=${encodeURIComponent(filter)}`;
      }
      const res = await api(url);
      setLogContent(res.content || '(empty)');
      setCurrentPage(res.page || 1);
      setTotalPages(res.totalPages || 1);
      setSelectedFile(file);
    } catch (err) {
      alert('Failed to read log: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.value;
    if (file) {
      readLog(file, 1, filterText);
    } else {
      setSelectedFile('');
      setLogContent('Select a log file to view its contents.');
      setCurrentPage(1);
      setTotalPages(1);
    }
  };

  const handleFilter = () => {
    if (selectedFile) {
      readLog(selectedFile, 1, filterText);
    }
  };

  const handlePrev = () => {
    if (currentPage > 1 && selectedFile) {
      readLog(selectedFile, currentPage - 1, filterText);
    }
  };

  const handleNext = () => {
    if (currentPage < totalPages && selectedFile) {
      readLog(selectedFile, currentPage + 1, filterText);
    }
  };

  const formatBytes = (b) => {
    if (!+b) return '0 B';
    const k = 1024, s = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return `${parseFloat((b / Math.pow(k, i)).toFixed(1))} ${s[i]}`;
  };

  return (
    <div className="card">
      <div className="logs-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
        <div className="logs-toolbar-left" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flex: 1, minWidth: '280px' }}>
          <Select
            value={selectedFile}
            onChange={handleFileChange}
            className="log-select"
            style={{
              minWidth: '180px'
            }}
          >
            <option value="">Select a log file...</option>
            {logFiles.map(f => (
              <option key={f.name} value={f.name}>
                {f.name} ({formatBytes(f.size)})
              </option>
            ))}
          </Select>
          <input
            type="text"
            placeholder="Filter logs..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleFilter()}
            className="log-filter"
            style={{
              padding: '6px 12px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius)',
              color: 'var(--text)',
              flex: 1
            }}
          />
          <button className="btn outline small" onClick={handleFilter} disabled={loading}>
            Filter
          </button>
        </div>

        <div className="logs-toolbar-right" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button className="btn outline small" onClick={handlePrev} disabled={currentPage <= 1 || loading}>
            Prev
          </button>
          <span className="log-page-info" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Page {currentPage} / {totalPages}
          </span>
          <button className="btn outline small" onClick={handleNext} disabled={currentPage >= totalPages || loading}>
            Next
          </button>
        </div>
      </div>

      <div style={{
        background: isLight ? '#ffffff' : '#0d0d0d',
        borderRadius: 'var(--radius)',
        border: `1px solid ${isLight ? '#d1d5db' : '#2a2a2a'}`,
        maxHeight: '60vh',
        overflowY: 'auto',
      }}>
        <pre style={{
          margin: 0,
          padding: '1.25rem',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.82rem',
          color: isLight ? '#1a1a1a' : '#e6e6e6',
          lineHeight: '1.5'
        }}>
          {logContent}
        </pre>
      </div>
    </div>
  );
}
