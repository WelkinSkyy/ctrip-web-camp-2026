import { useState } from 'preact/hooks';
import { currentUser, registeredUsers, showToast } from '../store';
import './Login.css';

const ADMIN_USERNAME = 'default';
const ADMIN_PASSWORD = '123';

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleAction = () => {
    if (!username.trim()) return showToast('请输入用户名');
    if (!password) return showToast('请输入密码');

    const name = username.trim();

    if (isRegister) {
      // 注册仅支持商户身份，写入已注册列表
      const id = 'u_' + Date.now();
      registeredUsers.value = [...registeredUsers.value, { username: name, id, name }];
      currentUser.value = { id, name, role: 'merchant' };
      window.location.href = '/merchant';
      return;
    }

    // 登录：仅 default / 123 为管理员
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      currentUser.value = { id: 'admin_1', name: ADMIN_USERNAME, role: 'admin' };
      window.location.href = '/admin';
      return;
    }
    if (username === ADMIN_USERNAME && password !== ADMIN_PASSWORD) {
      return showToast('密码错误');
    }

    // 商户登录：校验是否已注册
    const registered = registeredUsers.value.find((u) => u.username === name);
    if (!registered) {
      return showToast('请先注册');
    }
    currentUser.value = { id: registered.id, name: registered.name, role: 'merchant' };
    window.location.href = '/merchant';
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-brand-icon" aria-hidden>🏨</div>
          <h2 className="login-title">{isRegister ? '注册账号' : '欢迎登录'}</h2>
        </div>
        <div className="login-form">
          <div className="login-field">
            <label>用户名</label>
            <input
              className="login-input"
              type="text"
              autoComplete="username"
              value={username}
              onInput={(e) => setUsername(e.currentTarget.value)}
              placeholder="输入账号"
            />
          </div>

          <div className="login-field">
            <label>密码</label>
            <input
              className="login-input"
              type="password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              value={password}
              onInput={(e) => setPassword(e.currentTarget.value)}
              placeholder={isRegister ? '设置密码' : '输入密码'}
            />
          </div>

          <button type="button" onClick={handleAction} className="login-submit">
            {isRegister ? '立即注册' : '登录系统'}
          </button>

          <button type="button" onClick={() => setIsRegister(!isRegister)} className="login-toggle">
            {isRegister ? '已有账户？去登录' : '没有账号？去注册'}
          </button>
        </div>
      </div>
    </div>
  );
}
