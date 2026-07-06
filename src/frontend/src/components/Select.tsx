import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function Select({ value, onChange, children, style, className, disabled }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const dropdownRef = useRef(null);
  const [coords, setCoords] = useState({ left: 0, top: 0, width: 0, dropUp: false, topOffset: 0 });

  const updateCoords = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const dropdownHeight = 250;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      
      const dropUp = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
      
      setCoords({
        left: rect.left,
        top: rect.bottom,
        width: rect.width,
        dropUp,
        topOffset: rect.top
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      updateCoords();
      window.addEventListener('resize', updateCoords);
      window.addEventListener('scroll', updateCoords, true);
    }
    return () => {
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', updateCoords, true);
    };
  }, [isOpen]);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && containerRef.current.contains(event.target)) return;
      if (dropdownRef.current && dropdownRef.current.contains(event.target)) return;
      setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Parse children to extract options
  const options = [];
  React.Children.forEach(children, child => {
    if (React.isValidElement(child) && child.type === 'option') {
      options.push({
        value: child.props.value !== undefined ? child.props.value : child.props.children,
        label: child.props.children,
        disabled: child.props.disabled
      });
    } else if (child && child.type === React.Fragment) {
       React.Children.forEach(child.props.children, subChild => {
         if (React.isValidElement(subChild) && subChild.type === 'option') {
            options.push({
                value: subChild.props.value !== undefined ? subChild.props.value : subChild.props.children,
                label: subChild.props.children,
                disabled: subChild.props.disabled
            });
         }
       })
    } else if (Array.isArray(child)) {
        child.forEach(subChild => {
             if (React.isValidElement(subChild) && subChild.type === 'option') {
                options.push({
                    value: subChild.props.value !== undefined ? subChild.props.value : subChild.props.children,
                    label: subChild.props.children,
                    disabled: subChild.props.disabled
                });
             }
        })
    } else if (child !== null && typeof child === 'object') {
        // Fallback for nested maps returning arrays directly
        if (Array.isArray(child)) {
            child.forEach(subChild => {
                if (React.isValidElement(subChild) && subChild.type === 'option') {
                   options.push({
                       value: subChild.props.value !== undefined ? subChild.props.value : subChild.props.children,
                       label: subChild.props.children,
                       disabled: subChild.props.disabled
                   });
                }
            })
        } else if (React.isValidElement(child) && child.props && Array.isArray(child.props.children)) {
            child.props.children.forEach(subChild => {
                if (React.isValidElement(subChild) && subChild.type === 'option') {
                   options.push({
                       value: subChild.props.value !== undefined ? subChild.props.value : subChild.props.children,
                       label: subChild.props.children,
                       disabled: subChild.props.disabled
                   });
                }
            })
        }
    }
  });

  const selectedOption = options.find(opt => String(opt.value) === String(value));
  const displayLabel = selectedOption ? selectedOption.label : value;

  const handleSelect = (opt) => {
    if (opt.disabled || disabled) return;
    setIsOpen(false);
    if (onChange) {
      onChange({ target: { value: opt.value } });
    }
  };

  return (
    <div 
      ref={containerRef}
      className={`custom-select-container ${className || ''}`}
      style={{ position: 'relative', width: '100%', ...style, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      <div 
        className="custom-select-display"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        style={{
          width: '100%',
          padding: '0 38px 0 14px',
          height: style?.height || '38px',
          background: 'var(--bg-input)',
          border: isOpen ? '1px solid var(--accent)' : '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          color: 'var(--text-primary)',
          fontSize: '13.5px',
          display: 'flex',
          alignItems: 'center',
          boxShadow: isOpen ? '0 0 0 3px var(--accent-glow)' : 'none',
          transition: 'var(--transition)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          userSelect: 'none'
        }}
      >
        {displayLabel}
        
        {/* Dropdown Arrow */}
        <div style={{ position: 'absolute', right: '14px', top: '50%', transform: isOpen ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)', transition: 'transform 0.2s', pointerEvents: 'none', display: 'flex' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
      </div>

      {isOpen && !disabled && createPortal(
        <div 
          ref={dropdownRef}
          className="custom-select-dropdown"
          style={{
            position: 'fixed',
            ...(coords.dropUp 
              ? { bottom: window.innerHeight - coords.topOffset + 6 } 
              : { top: coords.top + 6 }),
            left: coords.left,
            width: coords.width,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-md)',
            maxHeight: '250px',
            overflowY: 'auto',
            zIndex: 999999,
            padding: '4px',
            backdropFilter: 'var(--glass-blur)',
            WebkitBackdropFilter: 'var(--glass-blur)',
          }}
        >
          {options.length === 0 && (
             <div style={{ padding: '8px 12px', fontSize: '13.5px', color: 'var(--text-muted)' }}>
               No options available
             </div>
          )}
          {options.map((opt, i) => {
            const isSelected = String(opt.value) === String(value);
            return (
              <div
                key={i}
                className="custom-select-option"
                onClick={() => handleSelect(opt)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '4px',
                  cursor: opt.disabled ? 'not-allowed' : 'pointer',
                  opacity: opt.disabled ? 0.5 : 1,
                  fontSize: '13.5px',
                  color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                  background: isSelected ? 'var(--accent-subtle)' : 'transparent',
                  transition: 'background 0.1s, color 0.1s',
                  userSelect: 'none'
                }}
                onMouseEnter={(e) => {
                  if (!opt.disabled && !isSelected) {
                    e.currentTarget.style.background = 'var(--bg-elevated)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!opt.disabled && !isSelected) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                {opt.label}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
