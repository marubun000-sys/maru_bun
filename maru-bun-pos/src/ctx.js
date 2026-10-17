import { createContext, useContext } from 'react'

export const DataCtx = createContext(null)
export const UICtx = createContext(null)
export const useData = () => useContext(DataCtx)
export const useUI = () => useContext(UICtx)
