import { useState } from 'react'
import NewBill from './NewBill'
import History from './History'

export default function POS() {
  const [sub, setSub] = useState('new')
  return (
    <div className="stack gap">
      <div className="seg">
        <button className={sub === 'new' ? 'on' : ''} onClick={() => setSub('new')}>New Bill</button>
        <button className={sub === 'hist' ? 'on' : ''} onClick={() => setSub('hist')}>Sales & Bill History</button>
      </div>
      {sub === 'new' ? <NewBill /> : <History />}
    </div>
  )
}
