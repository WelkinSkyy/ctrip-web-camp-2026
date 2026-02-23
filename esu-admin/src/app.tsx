import { useEffect } from 'preact/hooks';
import { LocationProvider, Router, Route } from 'preact-iso';
import { currentUser } from './store';
import { clearToken, getToken } from './api/request';
import { me } from './api/auth';
import Login from './pages/Login';
import HotelEdit from './pages/HotelEdit';
import AuditList from './pages/AuditList';
import MerchantList from './pages/MerchantList';
import { Toast } from './components/Toast';
import { ConfirmDialog } from './components/ConfirmDialog';
import './app.css';

const _LocationProvider = LocationProvider as any;
const _Router = Router as any;
const _Route = Route as any;

function mapRole(role: string): 'merchant' | 'admin' {
  return role === 'admin' ? 'admin' : 'merchant';
}

export function App() {
  const user = currentUser.value;

  useEffect(() => {
    if (user || !getToken()) return;
    me()
      .then((u) => {
        currentUser.value = { id: String(u.id), name: u.username, role: mapRole(u.role) };
      })
      .catch(() => {});
  }, []);

  return (
    <_LocationProvider>
      <div className="app-wrap">
        <header className="app-header">
          <div className="app-title">酒店管理后台</div>
          {user && (
            <div className="app-header-right">
              <nav className="app-nav">
                {user.role === 'merchant' ? (
                  <>
                    <a href="/merchant" className="app-nav-link">我的酒店</a>
                    <a href="/hotel/edit/new" className="app-nav-link">新增录入</a>
                  </>
                ) : (
                  <a href="/admin" className="app-nav-link">审核中心</a>
                )}
              </nav>
              <div className="app-user">
                <span className="app-user-name">{user.name} ({user.role})</span>
                <button type="button" onClick={() => { currentUser.value = null; clearToken(); window.location.href = '/login'; }} className="app-logout-btn">退出</button>
              </div>
            </div>
          )}
        </header>
        
        <main className="app-main">
          <_Router>
            <_Route path="/login" component={Login} />
            <_Route path="/merchant" component={MerchantList} />
            <_Route path="/hotel/edit/:id" component={HotelEdit} />
            <_Route path="/admin" component={AuditList} />
            <_Route default component={Login} /> 
          </_Router>
        </main>
        <Toast />
        <ConfirmDialog />
      </div>
    </_LocationProvider>
  );
}
