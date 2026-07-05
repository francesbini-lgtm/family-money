import { createPortal } from 'react-dom'

/**
 * Renders children into document.body via a React portal.
 *
 * Why: bottom sheets / confirmation overlays use position:fixed but were
 * rendered inside .m-content, which is a composited scroll container
 * (-webkit-overflow-scrolling: touch). On iOS Safari that creates a stacking
 * context, trapping the overlay's z-index below the floating bottom nav
 * (.m-nav, z-index 20). Portaling to <body> puts overlays in the root
 * stacking context so they always paint above the nav.
 */
export default function Portal({ children }) {
  return createPortal(children, document.body)
}
