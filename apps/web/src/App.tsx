import { useState } from 'react'
import Login from './components/Login'
import MapView from './components/MapView'
import { getToken } from './lib/api'

export default function App() {
  const [authed, setAuthed] = useState(!!getToken())
  return authed ? <MapView /> : <Login onDone={() => setAuthed(true)} />
}