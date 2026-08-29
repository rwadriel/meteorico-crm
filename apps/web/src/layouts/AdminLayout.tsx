import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Megaphone,
  Users,
  Upload,
  Settings,
  Menu,
  X,
  LogOut,
  ChevronRight,
  FileText,
  ListFilter,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { useCanAccess } from '../hooks/usePermission.js';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, section: 'dashboard' },
  { to: '/contacts', label: 'Contatos', icon: Users, section: 'contacts' },
  { to: '/audiences', label: 'Públicos', icon: ListFilter, section: 'contacts' },
  { to: '/imports', label: 'Importar CSV', icon: Upload, section: 'imports' },
  { to: '/followup', label: 'Campanhas', icon: Megaphone, section: 'campaigns' },
  { to: '/templates', label: 'Templates', icon: FileText, section: 'templates' },
  { to: '/settings', label: 'Configurações', icon: Settings, section: 'settings' },
];

function Breadcrumbs() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  if (segments.length === 0) return null;

  const item = NAV_ITEMS.find((n) => n.to === `/${segments[0]}`);

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <NavLink to="/">Dashboard</NavLink>
      {item && (
        <>
          <ChevronRight size={14} />
          <span>{item.label}</span>
        </>
      )}
    </nav>
  );
}

export function AdminLayout(): React.ReactElement {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="layout">
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          role="presentation"
        />
      )}

      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <span className="sidebar-logo">☄</span>
          <span className="sidebar-title">Meteorico</span>
          <button
            className="sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav" role="navigation" aria-label="Menu principal">
          {NAV_ITEMS.map((item) => (
            <SidebarItem key={item.to} item={item} onNavigate={() => setSidebarOpen(false)} />
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">{user?.name?.charAt(0).toUpperCase() ?? 'U'}</div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{user?.name}</span>
              <span className="sidebar-user-role">{user?.role}</span>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={handleLogout}>
            <LogOut size={16} />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      <div className="layout-main">
        <header className="topbar">
          <button
            className="topbar-menu"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu size={24} />
          </button>
          <Breadcrumbs />
          <div className="topbar-right">
            <span className="topbar-version">v0.5.0</span>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SidebarItem({
  item,
  onNavigate,
}: {
  item: (typeof NAV_ITEMS)[number];
  onNavigate: () => void;
}) {
  const canAccess = useCanAccess(item.section);
  if (!canAccess) return null;

  const Icon = item.icon;

  return (
    <NavLink
      to={item.to}
      className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
      onClick={onNavigate}
      end={item.to === '/'}
    >
      <Icon size={20} />
      <span>{item.label}</span>
    </NavLink>
  );
}
