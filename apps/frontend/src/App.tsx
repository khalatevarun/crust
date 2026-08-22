import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const [ws, setWs] = useState(new WebSocket("ws://localhost:3000"))

  useEffect(()=>{
    
    if(ws){
        ws.onopen = () => {
           ws.send("hello")
      }
    }
     
  },[ws]);

  return (
    <>
    hi there!
    </>
  )
}

export default App;