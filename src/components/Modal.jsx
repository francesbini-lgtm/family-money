import { useEffect } from 'react'
import { X } from 'lucide-react'
import './Modal.css'

export default function Modal({ title, onClose, children, width = 480 }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" style={{ width, maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
        <div className="modal-hdr">
          <h3 className="modal-title">{title}</h3>
          <button className="btn btn-ghost modal-close" onClick={onClose}><X size={16}/></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export function ModalFooter({ children }) {
  return <div className="modal-ftr">{children}</div>
}

export function FormRow({ label, children }) {
  return (
    <div className="form-row">
      <label className="form-lbl">{label}</label>
      {children}
    </div>
  )
}

export function Input({ ...props }) {
  return <input className="form-inp" {...props} />
}

export function Select({ children, ...props }) {
  return <select className="form-inp" {...props}>{children}</select>
}
