import { useState } from 'preact/hooks';
import { currentUser} from '../store';
import type { Role} from '../store';

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [role, setRole] = useState<Role>('merchant');
  const [username, setUsername] = useState('');

  const handleAction = () => {
    if(!username) return alert('请输入用户名');
    const finalRole = isRegister ? role : (username.toLowerCase().includes('admin') ? 'admin' : 'merchant');
    currentUser.value = { id: 'u_' + Date.now(), name: username, role: finalRole };
    window.location.href = finalRole === 'admin' ? '/admin' : '/merchant';
  };

  return (
    <div className="max-w-md mx-auto mt-20 bg-white p-10 rounded-2xl shadow-xl border border-gray-100 text-slate-800">
      <h2 className="text-3xl font-extrabold mb-8 text-center">{isRegister ? '注册账号' : '欢迎登录'}</h2>
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-semibold text-gray-600 mb-2">用户名</label>
          <input className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition"
                 onInput={(e) => setUsername(e.currentTarget.value)} placeholder="输入账号" />
        </div>

        {isRegister && (
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-2 font-bold">选择身份</label>
            <div className="flex gap-4 mt-2">
              <label className={`flex-1 flex items-center justify-center p-3 border rounded-lg cursor-pointer transition ${role === 'merchant' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white'}`}>
                <input type="radio" className="hidden" checked={role === 'merchant'} onChange={() => setRole('merchant')} /> 商户
              </label>
              <label className={`flex-1 flex items-center justify-center p-3 border rounded-lg cursor-pointer transition ${role === 'admin' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white'}`}>
                <input type="radio" className="hidden" checked={role === 'admin'} onChange={() => setRole('admin')} /> 管理员
              </label>
            </div>
          </div>
        )}

        <button onClick={handleAction} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-lg">
          {isRegister ? '立即注册' : '登录系统'}
        </button>

        <button onClick={() => setIsRegister(!isRegister)} className="w-full text-sm text-indigo-600 font-bold hover:underline">
          {isRegister ? '已有账户？去登录' : '没有账号？去注册'}
        </button>
      </div>
    </div>
  );
}
