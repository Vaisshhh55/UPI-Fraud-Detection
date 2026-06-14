import { useEffect, useState } from 'react';
import axios from 'axios';

const defaultTransaction = {
  amount: 1200,
  location: 'Bengaluru',
  deviceId: 'device-001',
  frequency: 3,
  locationAnomaly: false,
  timeAnomaly: false
};

function App() {
  const [authMode, setAuthMode] = useState('login');
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [registerData, setRegisterData] = useState({ name: '', email: '', password: '', role: 'user' });
  const [form, setForm] = useState(defaultTransaction);
  const [transactions, setTransactions] = useState([]);
  const [users, setUsers] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState({ total: 0, fraud: 0, legitimate: 0 });
  const [analytics, setAnalytics] = useState(null);
  const [systemHealth, setSystemHealth] = useState(null);
  const [message, setMessage] = useState('');
  const [authError, setAuthError] = useState('');
  const [adminTab, setAdminTab] = useState('users');
  const [userTab, setUserTab] = useState('transactions');
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedUserTransactions, setSelectedUserTransactions] = useState([]);
  const [fraudThreshold, setFraudThreshold] = useState(0.6);

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  const request = async (url, options = {}) => {
    const config = {
      url,
      method: options.method || 'get',
      baseURL: 'http://localhost:5000',
      headers: { ...authHeaders, ...(options.headers || {}) },
      data: options.data || undefined
    };
    return axios(config);
  };

  useEffect(() => {
    if (!token) return;
    fetchStats();
    if (user?.role === 'admin') {
      fetchUsers();
      fetchAnalytics();
      fetchSystemHealth();
    } else {
      fetchAlerts();
    }
  }, [token, user?.role]);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    const interval = setInterval(() => {
      fetchUsers();
      fetchAnalytics();
      fetchSystemHealth();
    }, 10000);
    return () => clearInterval(interval);
  }, [user?.role]);

  const setSession = (session) => {
    localStorage.setItem('token', session.token);
    localStorage.setItem('user', JSON.stringify(session.user));
    setToken(session.token);
    setUser(session.user);
    setAuthError('');
  };

  const handleAuthChange = (event) => {
    const { name, value } = event.target;
    if (authMode === 'login') {
      setLoginData((prev) => ({ ...prev, [name]: value }));
    } else {
      setRegisterData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    try {
      const response = await axios.post('http://localhost:5000/api/login', loginData);
      setSession(response.data);
      setLoginData({ email: '', password: '' });
    } catch (error) {
      setAuthError(error.response?.data?.error || 'Login failed');
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    try {
      const response = await axios.post('http://localhost:5000/api/register', registerData);
      setSession(response.data);
      setRegisterData({ name: '', email: '', password: '', role: 'user' });
    } catch (error) {
      setAuthError(error.response?.data?.error || 'Registration failed');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    setTransactions([]);
    setUsers([]);
    setAlerts([]);
    setStats({ total: 0, fraud: 0, legitimate: 0 });
    setMessage('');
    setAuthError('');
  };

  const fetchTransactions = async () => {
    try {
      const response = await request('/api/transactions');
      setTransactions(response.data);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await request('/api/stats');
      setStats(response.data);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await request('/api/admin/users');
      const filteredUsers = response.data.filter((u) => u.role === 'user');
      setUsers(filteredUsers);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const response = await request('/api/admin/fraud-analytics');
      setAnalytics(response.data);
    } catch (error) {
      console.error(error);
      setAnalytics({
        totalTransactions: 0,
        totalFraud: 0,
        fraudRate: '0%',
        locationFraud: {},
        amountFraud: { under_1k: 0, '1k_5k': 0, '5k_10k': 0, over_10k: 0 },
        amountRanges: { under_1k: 0, '1k_5k': 0, '5k_10k': 0, over_10k: 0 },
        recentAlerts: []
      });
    }
  };

  const locationAnalytics = analytics ? Object.entries(analytics.locationFraud || {}).map(([loc, data]) => ({
    key: loc,
    label: loc,
    fraud: data.fraud || 0,
    total: data.total || 0
  })) : [];

  const totalLocationFraud = locationAnalytics.reduce((sum, item) => sum + item.fraud, 0);
  const pieColors = ['#38bdf8', '#818cf8', '#22c55e', '#f97316', '#fb7185', '#e879f9'];
  const locationPieStyle = {
    background: totalLocationFraud
      ? `conic-gradient(${locationAnalytics
          .map((item, idx) => {
            const percentage = (item.fraud / totalLocationFraud) * 100;
            return `${pieColors[idx % pieColors.length]} ${percentage.toFixed(2)}%`;
          })
          .join(', ')})`
      : '#0f172a'
  };

  const fetchSystemHealth = async () => {
    try {
      const response = await request('/api/admin/system-health');
      setSystemHealth(response.data);
      setFraudThreshold(response.data.stats.fraudThreshold);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchAlerts = async () => {
    try {
      const response = await request('/api/user/alerts');
      setAlerts(response.data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleSelectUser = async (userId) => {
    setSelectedUser(userId);
    try {
      const response = await request(`/api/admin/users/${userId}/transactions`);
      setSelectedUserTransactions(response.data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleFlagUser = async (userId, isFlagged) => {
    try {
      await request(`/api/admin/users/${userId}/flag`, {
        method: 'post',
        data: { flagged: !isFlagged, reason: 'Admin flagged suspicious activity' }
      });
      fetchUsers();
    } catch (error) {
      console.error(error);
    }
  };

  const handleUpdateThreshold = async () => {
    try {
      await request('/api/admin/fraud-threshold', {
        method: 'post',
        data: { threshold: fraudThreshold }
      });
      setMessage('✓ Fraud threshold updated successfully');
    } catch (error) {
      setMessage('✗ Failed to update threshold');
    }
  };

  const handleExportTransactions = async () => {
    try {
      const response = await request('/api/transactions/export', {
        method: 'post',
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
    } catch (error) {
      console.error(error);
    }
  };

  const handleTransactionChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmitTransaction = async (event) => {
    event.preventDefault();
    if (!token) {
      setMessage('Please login before submitting transactions.');
      return;
    }

    try {
      const response = await request('/api/transactions', {
        method: 'post',
        data: form
      });
      const prediction = response.data.prediction;
      let isFraud = false;
      
      if (prediction.fraud) {
        isFraud = true;
        setMessage('🚨 Fraud Alert! Suspicious transaction detected.');
        setUserTab('transactions');
      } else {
        setMessage('✓ Transaction looks legitimate.');
      }
      
      setForm(defaultTransaction);
      
      // Refresh data - add small delay for backend to process alert
      await fetchTransactions();
      await fetchStats();
      
      // Add delay before fetching alerts to ensure backend processing
      if (isFraud) {
        setTimeout(async () => {
          await fetchAlerts();
        }, 300);
      } else {
        await fetchAlerts();
      }
    } catch (error) {
      console.error(error);
      setMessage(error.response?.data?.error || 'Unable to submit transaction.');
    }
  };

  if (!user) {
    return (
      <div className="app-shell">
        <header>
          <h1>UPI Fraud Detection System</h1>
          <p>Secure Transaction Monitoring with ML</p>
        </header>

        <section className="auth-panel">
          {authMode === 'login' ? (
            <form onSubmit={handleLogin}>
              <h2>Login</h2>
              <label>
                Email
                <input name="email" type="email" value={loginData.email} onChange={handleAuthChange} required />
              </label>
              <label>
                Password
                <input name="password" type="password" value={loginData.password} onChange={handleAuthChange} required />
              </label>
              <button type="submit">Login</button>
              <p>
                New user? <button type="button" onClick={() => { setAuthMode('register'); setAuthError(''); }}>Create account</button>
              </p>
              {authError && <div className="alert-error">{authError}</div>}
            </form>
          ) : (
            <form onSubmit={handleRegister}>
              <h2>Register</h2>
              <label>
                Name
                <input name="name" value={registerData.name} onChange={handleAuthChange} required />
              </label>
              <label>
                Email
                <input name="email" type="email" value={registerData.email} onChange={handleAuthChange} required />
              </label>
              <label>
                Password
                <input name="password" type="password" value={registerData.password} onChange={handleAuthChange} required />
              </label>
              <label>
                Role
                <select name="role" value={registerData.role} onChange={handleAuthChange}>
                  <option value="user">Regular User</option>
                  <option value="admin">Administrator</option>
                </select>
              </label>
              <button type="submit">Register</button>
              <p>
                Already registered? <button type="button" onClick={() => { setAuthMode('login'); setAuthError(''); }}>Login</button>
              </p>
              {authError && <div className="alert-error">{authError}</div>}
            </form>
          )}
        </section>
      </div>
    );
  }

  if (user.role === 'admin') {
    return (
      <div className="app-shell">
        <header>
          <div className="top-bar">
            <div>
              <h1>🔐 Admin Dashboard</h1>
              <p>Security & Fraud Monitoring System</p>
            </div>
            <button className="ghost-button" onClick={handleLogout}>Logout</button>
          </div>
        </header>

        <section className="stats-card">
          <div>
            <strong>Total Transactions</strong>
            <span>{systemHealth?.stats.totalTransactions || 0}</span>
          </div>
          <div>
            <strong>Registered Users</strong>
            <span>{systemHealth?.stats.totalUsers || 0}</span>
          </div>
          <div className="stat-alert">
            <strong>Fraud Cases</strong>
            <span>{systemHealth?.stats.fraudDetected || 0}</span>
          </div>
          <div className="stat-good">
            <strong>Fraud Rate</strong>
            <span>{analytics ? ((analytics.totalFraud / analytics.totalTransactions * 100).toFixed(2) + '%') : '0%'}</span>
          </div>
        </section>

        <section className="admin-tabs">
          <div className="tab-buttons">
            <button className={adminTab === 'users' ? 'active' : ''} onClick={() => setAdminTab('users')}>👥 Users</button>
            <button className={adminTab === 'analytics' ? 'active' : ''} onClick={() => setAdminTab('analytics')}>📊 Analytics</button>
            <button className={adminTab === 'health' ? 'active' : ''} onClick={() => setAdminTab('health')}>🏥 System</button>
            <button className={adminTab === 'config' ? 'active' : ''} onClick={() => setAdminTab('config')}>⚙️ Config</button>
          </div>

          {adminTab === 'users' && (
            <div className="tab-content">
              <div className="tab-header-row">
                <h2>User Management</h2>
                <button className="secondary-button" onClick={fetchUsers}>Refresh users</button>
              </div>
              {!selectedUser ? (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Transactions</th>
                      <th>Fraud</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className={u.isFlagged ? 'flagged-row' : ''}>
                        <td>{u.name}</td>
                        <td>{u.email}</td>
                        <td>{u.transactionCount}</td>
                        <td className={u.fraudCount > 0 ? 'fraud-highlight' : ''}>{u.fraudCount}</td>
                        <td>{u.isFlagged ? '🚩 Flagged' : '✓ Active'}</td>
                        <td>
                          <button onClick={() => handleSelectUser(u.id)} className="link-button">View</button>
                          <button onClick={() => handleFlagUser(u.id, u.isFlagged)} className="link-button">
                            {u.isFlagged ? 'Unflag' : 'Flag'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="user-detail">
                  <button className="back-button" onClick={() => setSelectedUser(null)}>← Back</button>
                  <h3>Transactions</h3>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Amount</th>
                        <th>Location</th>
                        <th>Device</th>
                        <th>Fraud</th>
                        <th>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedUserTransactions.map((tx, idx) => (
                        <tr key={idx} className={tx.prediction?.fraud ? 'fraud-row' : ''}>
                          <td>{new Date(tx.createdAt).toLocaleString()}</td>
                          <td>₹{tx.amount}</td>
                          <td>{tx.location}</td>
                          <td>{tx.deviceId}</td>
                          <td>{tx.prediction?.fraud ? '🚨 Yes' : 'No'}</td>
                          <td>{(tx.prediction?.score * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {adminTab === 'analytics' && (
            <div className="tab-content">
              <h2>Fraud Analytics</h2>
              {analytics ? (
                <div className="analytics-grid">
                  <div className="analytics-card analytics-chart-card">
                    <h4>Fraud Share by Location</h4>
                    <div className="pie-chart" style={locationPieStyle}>
                      {totalLocationFraud === 0 && <span className="pie-empty">No fraud data</span>}
                    </div>
                    <div className="pie-legend">
                      {locationAnalytics.map((item, idx) => {
                        const percentage = totalLocationFraud ? (item.fraud / totalLocationFraud) * 100 : 0;
                        return (
                          <div key={item.key} className="pie-item">
                            <span className="pie-bullet" style={{ background: pieColors[idx % pieColors.length] }} />
                            <span>{item.label}</span>
                            <span>{item.fraud} ({percentage.toFixed(0)}%)</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="muted">Loading analytics data...</p>
              )}
            </div>
          )}

          {adminTab === 'health' && systemHealth && (
            <div className="tab-content">
              <h2>System Health</h2>
              <div className="health-info">
                <p><strong>Status:</strong> {systemHealth.status}</p>
                <p><strong>ML Service:</strong> {systemHealth.mlServiceStatus}</p>
                <p><strong>Users:</strong> {systemHealth.stats.totalUsers}</p>
                <p><strong>Transactions:</strong> {systemHealth.stats.totalTransactions}</p>
                <p><strong>Fraud Cases:</strong> {systemHealth.stats.fraudDetected}</p>
              </div>
            </div>
          )}

          {adminTab === 'config' && (
            <div className="tab-content">
              <h2>System Configuration</h2>
              <div className="config-panel">
                <label>
                  Fraud Threshold (0-1)
                  <input type="number" min="0" max="1" step="0.05" value={fraudThreshold} onChange={(e) => setFraudThreshold(parseFloat(e.target.value))} />
                </label>
                <p className="help-text">Higher = fewer alerts, Lower = more alerts</p>
                <button onClick={handleUpdateThreshold} className="primary-button">Update</button>
                {message && <div className="alert-message">{message}</div>}
              </div>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header>
        <div className="top-bar">
          <div>
            <h1>💳 Transaction Dashboard</h1>
            <p>Welcome, {user.name}</p>
          </div>
          <button className="ghost-button" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <section className="stats-card">
        <div>
          <strong>Total</strong>
          <span>{stats.total}</span>
        </div>
        <div className="stat-good">
          <strong>Legitimate</strong>
          <span>{stats.legitimate}</span>
        </div>
        <div className="stat-alert">
          <strong>Fraudulent</strong>
          <span>{stats.fraud}</span>
        </div>
      </section>

      <section className="user-tabs">
        <div className="tab-buttons">
          <button className={userTab === 'transactions' ? 'active' : ''} onClick={() => setUserTab('transactions')}>📋 Transactions</button>
          <button className={userTab === 'submit' ? 'active' : ''} onClick={() => setUserTab('submit')}>➕ Submit</button>
        </div>

        {userTab === 'transactions' && (
          <div className="tab-content">
            <h2>Your Transactions</h2>
            <button onClick={handleExportTransactions} className="export-button">📥 Export CSV</button>
            <table className="user-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Amount</th>
                  <th>Location</th>
                  <th>Device</th>
                  <th>Status</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx, idx) => (
                  <tr key={idx} className={tx.prediction?.fraud ? 'fraud-row' : ''}>
                    <td>{new Date(tx.createdAt).toLocaleString()}</td>
                    <td>₹{tx.amount}</td>
                    <td>{tx.location}</td>
                    <td>{tx.deviceId}</td>
                    <td>{tx.prediction?.fraud ? '🚨 Fraud' : '✓ OK'}</td>
                    <td>{(tx.prediction?.score * 100).toFixed(1)}%</td>
                  </tr>
                ))}
                {transactions.length === 0 && <tr><td colSpan="6">No transactions</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {userTab === 'submit' && (
          <div className="tab-content">
            <h2>Record Transaction</h2>
            <form onSubmit={handleSubmitTransaction} className="transaction-form">
              <label>
                Amount (₹)
                <input name="amount" type="number" value={form.amount} onChange={handleTransactionChange} required />
              </label>
              <label>
                Location
                <input name="location" value={form.location} onChange={handleTransactionChange} required />
              </label>
              <label>
                Device ID
                <input name="deviceId" value={form.deviceId} onChange={handleTransactionChange} required />
              </label>
              <label>
                Frequency
                <input name="frequency" type="number" value={form.frequency} onChange={handleTransactionChange} required />
              </label>
              <div className="checkbox-group">
                <label className="checkbox-row">
                  <input name="locationAnomaly" type="checkbox" checked={form.locationAnomaly} onChange={handleTransactionChange} />
                  Location anomaly
                </label>
                <label className="checkbox-row">
                  <input name="timeAnomaly" type="checkbox" checked={form.timeAnomaly} onChange={handleTransactionChange} />
                  Time anomaly
                </label>
              </div>
              <button type="submit" className="primary-button">Submit</button>
            </form>
            {message && <div className="alert-message">{message}</div>}
          </div>
        )}
      </section>
    </div>
  );
}

export default App;
