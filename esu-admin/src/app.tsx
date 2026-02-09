import { LocationProvider, Router, Route } from 'preact-iso';
import { currentUser } from './store';
import Login from './pages/Login';
import HotelEdit from './pages/HotelEdit';
import AuditList from './pages/AuditList';
import MerchantList from './pages/MerchantList';
import './app.css'

const _LocationProvider = LocationProvider as any;
const _Router = Router as any;
const _Route = Route as any;

export function App() {
  const user = currentUser.value;

  return (
    <_LocationProvider>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-indigo-700 text-white h-16 flex items-center justify-between px-8 shadow-md shrink-0">
          <div className="text-xl font-bold tracking-tight">酒店管理后台</div>
          {user && (
            <div className="flex items-center gap-6">
              <nav className="flex gap-4 text-sm font-medium">
                {user.role === 'merchant' ? (
                  <>
                    <a href="/merchant" className="hover:text-indigo-200">我的酒店</a>
                    <a href="/hotel/edit/new" className="hover:text-indigo-200">新增录入</a>
                  </>
                ) : (
                  <a href="/admin" className="hover:text-indigo-200">审核中心</a>
                )}
              </nav>
              <div className="border-l border-indigo-500 pl-4 flex items-center gap-3">
                <span className="text-indigo-100">{user.name} ({user.role})</span>
                <button onClick={() => { currentUser.value = null; window.location.href = '/'; }} 
                        className="bg-indigo-800 px-3 py-1 rounded text-xs hover:bg-indigo-900 transition">退出</button>
              </div>
            </div>
          )}
        </header>
        
        <main className="flex-grow container mx-auto p-6">
          <_Router>
            <_Route path="/login" component={Login} />
            <_Route path="/merchant" component={MerchantList} />
            <_Route path="/hotel/edit/:id" component={HotelEdit} />
            <_Route path="/admin" component={AuditList} />
            <_Route default component={Login} /> 
          </_Router>
        </main>
      </div>
    </_LocationProvider>
  );
}
