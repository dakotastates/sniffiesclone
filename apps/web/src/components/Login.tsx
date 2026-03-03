import { useState } from 'react'
import { api, setToken } from '../lib/api'

export default function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('test@example.com')
  const [password, setPassword] = useState('password123')
  const [error, setError] = useState<string | null>(null)

  async function login() {
    setError(null)
    try {
      const data = await api<{ accessToken: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      setToken(data.accessToken)
      onDone()
    } catch (e: any) {
      setError(e.message ?? 'Login failed')
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 420 }}>
      <h2>Login</h2>
      <div style={{ display: 'grid', gap: 8 }}>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" type="password" />
        <button onClick={login}>Login</button>
        {error && <pre style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}>{error}</pre>}
      </div>
      <p style={{ marginTop: 12, opacity: 0.7 }}>
        (Use your existing test user credentials for now.)
      </p>
    </div>
  )
}